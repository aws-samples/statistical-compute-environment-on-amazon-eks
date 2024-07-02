import * as cdk from 'aws-cdk-lib'
import { type Construct } from 'constructs'
import * as eks from 'aws-cdk-lib/aws-eks'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as util from './util'
import { NagSuppressions } from 'cdk-nag'

interface EksAddonsProps extends cdk.StackProps {
  cluster: eks.CfnCluster
  efsCsiDriverServiceAccountName: string
  vpcCniDriverServiceAccountName: string
}

export class AddonsStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props: EksAddonsProps) {
    super(scope, id, props)

    // Supressing CDK NAG wildcard issues as role is only applied to the governed and vetted EFS driver package.
    // Custom resource specifications drastically increases complexity
    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'Following EFS driver best-practices.'
      },
    ])
    // Supressing CDK NAG wildcard issues as role is only applied to the governed and vetted ALB Controller package.
    // Custom resource specifications drastically increases complexity
    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'Log groups are dynamically created so it requires broad scope permissions. No significant impact to security. '
      },
    ])

    const coreDns = new eks.CfnAddon(this, 'posit-sce-eks-core-dns', {
      addonName: 'coredns',
      clusterName: props.cluster.name!,
      resolveConflicts: 'OVERWRITE'
    })

    const kubeProxy = new eks.CfnAddon(this, 'posit-sce-eks-kube-proxy', {
      addonName: 'kube-proxy',
      clusterName: props.cluster.name!,
      resolveConflicts: 'OVERWRITE'
    })

    kubeProxy.addDependency(coreDns)

    this.podIdentitySetup(props)
    this.efsCsiAddonIrsaSetup(props)
    this.vpcCniAddonSetup(kubeProxy, props)
  }

  private podIdentitySetup(props: EksAddonsProps): void {
    const podIdentityAddon = new eks.CfnAddon(this, 'posit-sce-pod-identity-addon', {
      clusterName: props.cluster.name!,
      addonName: 'eks-pod-identity-agent'
    })
  }

  private vpcCniAddonSetup(kubeProxy: eks.CfnAddon, props: EksAddonsProps): void {
    const oidcProviderArn = util.getOidcProviderArn(this, props.cluster.attrOpenIdConnectIssuerUrl)
    const oidcProviderResourceArn = util.getOidcProviderResourceArn(this, props.cluster.attrOpenIdConnectIssuerUrl)
    const condition = new cdk.CfnJson(this, 'eks-vpc-cni-svc-account-condition', {
      value: {
        [`${oidcProviderResourceArn}:aud`]: 'sts.amazonaws.com',
        [`${oidcProviderResourceArn}:sub`]: `system:serviceaccount:kube-system:${props.vpcCniDriverServiceAccountName}`
      }
    })

    const vpcCniSvcAccountRole = new iam.Role(this, 'posit-sce-eks-vpc-cni-role', {
      assumedBy: new iam.FederatedPrincipal(oidcProviderArn, { StringEquals: condition }, 'sts:AssumeRoleWithWebIdentity'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy')
      ],
      inlinePolicies: {
        cwlogs: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'logs:DescribeLogGroups',
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents'
              ],
              resources: ['*']
            })
          ]
        })
      }
    })

    const vpcCniAddon = new eks.CfnAddon(this, 'posit-sce-eks-vpc-cni', {
      addonName: 'vpc-cni',
      addonVersion: 'v1.16.4-eksbuild.2',
      clusterName: props.cluster.name!,
      serviceAccountRoleArn: vpcCniSvcAccountRole.roleArn,
      resolveConflicts: 'OVERWRITE'
    })

    vpcCniAddon.node.addDependency(kubeProxy)
  }

  /*
  *  Use as long https://github.com/kubernetes-sigs/aws-efs-csi-driver/issues/1257 open
  */
  private efsCsiAddonIrsaSetup(props: EksAddonsProps): void {
    const oidcProviderResourceArn = util.getOidcProviderResourceArn(this, props.cluster.attrOpenIdConnectIssuerUrl)

    const condition = new cdk.CfnJson(this, 'eks-efs-csi-svc-account-condition', {
      value: {
        [`${oidcProviderResourceArn}:aud`]: 'sts.amazonaws.com',
        [`${oidcProviderResourceArn}:sub`]: `system:serviceaccount:kube-system:${props.efsCsiDriverServiceAccountName}`
      }
    })

    const oidcProviderArn = util.getOidcProviderArn(this, props.cluster.attrOpenIdConnectIssuerUrl)
    const efsDriverSvcAccountRole = new iam.Role(this, 'posit-sce-eks-efs-driver-role', {
      assumedBy: new iam.FederatedPrincipal(oidcProviderArn, { StringEquals: condition }, 'sts:AssumeRoleWithWebIdentity'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEFSCSIDriverPolicy')
      ]
    })

    const efsDriverAddon = new eks.CfnAddon(this, 'posit-sce-efs-csi-addon', {
      clusterName: props.cluster.name!,
      addonName: 'aws-efs-csi-driver',
      serviceAccountRoleArn: efsDriverSvcAccountRole.roleArn
    })
  }

  /*
  * Use when https://github.com/kubernetes-sigs/aws-efs-csi-driver/pull/1254 merged
  */
  private efsCsiAddonPodIdentitySetup(props: EksAddonsProps): void {
    const efsDriverRole = new iam.Role(this, 'posit-sce-eks-efs-driver-role', {
      assumedBy: new iam.ServicePrincipal('pods.eks.amazonaws.com').withSessionTags(),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEFSCSIDriverPolicy')
      ]
    })

    const efsCsiPodIdentityAssociation = new eks.CfnPodIdentityAssociation(this, 'efs-driver-sa-role-association', {
      clusterName: props.cluster.name!,
      namespace: 'kube-system',
      roleArn: efsDriverRole.roleArn,
      serviceAccount: props.efsCsiDriverServiceAccountName
    })

    // efsCsiPodIdentityAssociation.node.addDependency(podIdentityAddon)
  }
}

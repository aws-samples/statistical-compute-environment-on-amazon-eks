import * as cdk from 'aws-cdk-lib'
import { type Construct } from 'constructs'
import type * as eks from 'aws-cdk-lib/aws-eks'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as util from './util'
import * as albPolicyDocument from './alb_controller_iam_policy.json'
import { NagSuppressions } from 'cdk-nag'

interface AlbStackProps extends cdk.StackProps {
  vpc: ec2.Vpc
  cluster: eks.CfnCluster
  albControllerServiceAccountName: string
}

export class AlbStack extends cdk.NestedStack {
  public readonly securityGroup: ec2.SecurityGroup

  constructor(scope: Construct, id: string, props: AlbStackProps) {
    super(scope, id, props)

    const oidcProviderArn = util.getOidcProviderArn(this, props.cluster.attrOpenIdConnectIssuerUrl)
    const oidcProviderResourceArn = util.getOidcProviderResourceArn(this, props.cluster.attrOpenIdConnectIssuerUrl)
    const conditionAlb = new cdk.CfnJson(this, 'eks-vpc-cni-svc-account-condition', {
      value: {
        [`${oidcProviderResourceArn}:aud`]: 'sts.amazonaws.com',
        [`${oidcProviderResourceArn}:sub`]: 'system:serviceaccount:kube-system:aws-load-balancer-controller'
      }
    })

    // policy downloaded from https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.5.4/docs/install/iam_policy.json
    // Supressing CDK NAG wildcard issues as role is only applied to the governed and vetted ALB Controller package.
    // Custom resource specifications drastically increases complexity
    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'Will add too much complexity to specify, following the ALB controller guidance and security practices'
      },
    ])
    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-EC23',
        reason: 'Only port 443 & 80 are open to the 0.0.0.0/0 range. Faulty check.'
      },
    ])

    const albRole = new iam.Role(this, 'posit-eks-cluster-alb-role', {
      assumedBy: new iam.FederatedPrincipal(oidcProviderArn, { StringEquals: conditionAlb }, 'sts:AssumeRoleWithWebIdentity'),
      inlinePolicies: {
        alb: iam.PolicyDocument.fromJson(albPolicyDocument)
      }
    })


    this.securityGroup = new ec2.SecurityGroup(this, 'posit-eks-alb-sg', {
      securityGroupName: 'posit-eks-alb-sg',
      description: 'SG for Posit ALB',
      vpc: props.vpc,
      allowAllOutbound: true
    })

    this.securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80))
    this.securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443))

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const albOutput = new cdk.CfnOutput(this, 'alb-role-arn-output', {
      key: 'AlbControllerRoleArn',
      description: 'Role used for AWS ALB Controller',
      value: albRole.roleArn
    })

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const albSgOutput = new cdk.CfnOutput(this, 'alb-sg-output', {
      key: 'AlbSg',
      description: 'Security Group for Posit SCE ALB',
      value: this.securityGroup.securityGroupId
    })
  }
}

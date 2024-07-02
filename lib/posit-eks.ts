import * as cdk from 'aws-cdk-lib'
import { type Construct } from 'constructs'
import * as eks from 'aws-cdk-lib/aws-eks'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as iam from 'aws-cdk-lib/aws-iam'
import { NagSuppressions } from 'cdk-nag'

interface EksStackProps extends cdk.StackProps {
  vpc: ec2.Vpc
  clusterName: string
}

export class EksStack extends cdk.NestedStack {
  public readonly cluster: eks.CfnCluster

  constructor(scope: Construct, id: string, props: EksStackProps) {
    super(scope, id, props)

    // CDK NAG Supression
    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'Accepted minimal risk based on reliability and transferability requirements. Customers can change this to be more resource specific.'
      },
    ])
    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-EKS1',
        reason: 'Solution deployment requires access to the EKS Kube API from the client device. We cannot assume VPC connectivity setup to client.'
      },
    ])

    const serviceRole = new iam.Role(this, 'eks-service-role', {
      assumedBy: new iam.ServicePrincipal('eks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSClusterPolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSVPCResourceController'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy')
      ]
    })

    this.cluster = new eks.CfnCluster(this, `${props.clusterName}-cluster`, {
      name: props.clusterName,
      roleArn: serviceRole.roleArn,
      accessConfig: {
        authenticationMode: 'API',
        bootstrapClusterCreatorAdminPermissions: false
      },
      resourcesVpcConfig: {
        subnetIds: props.vpc.privateSubnets.map(subnet => subnet.subnetId),
        endpointPrivateAccess: true
      },
      version: '1.29', // eks.KubernetesVersion.V1_28.version
      logging: {
        clusterLogging: {
          enabledTypes: [
            {
              type: 'api'
            },
            {
              type: 'audit'
            },
            {
              type: 'authenticator'
            },
            {
              type: 'controllerManager'
            },
            {
              type: 'scheduler'
            }
          ]
        }
      }
    })

    const nodeRole = new iam.Role(this, 'posit-eks-cluster-node-role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy'),
        // needed at first, otherwise node group doesn't join cluster
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy')
      ]
    })

    const nodegroupsmall = new eks.CfnNodegroup(this, 'posit-cluster-node-group-small', {
      clusterName: props.clusterName,
      nodeRole: nodeRole.roleArn,
      subnets: props.vpc.privateSubnets.map(subnet => subnet.subnetId),
      forceUpdateEnabled: false,
      instanceTypes: [ec2.InstanceType.of(ec2.InstanceClass.M5, ec2.InstanceSize.XLARGE).toString()],
      nodegroupName: 'posit-small',
      scalingConfig: {
        desiredSize: 2,
        maxSize: 8,
        minSize: 2
      },
      diskSize: 50
    })

    const nodegrouplarge = new eks.CfnNodegroup(this, 'posit-cluster-node-group-large', {
      clusterName: props.clusterName,
      nodeRole: nodeRole.roleArn,
      subnets: props.vpc.privateSubnets.map(subnet => subnet.subnetId),
      forceUpdateEnabled: false,
      instanceTypes: [ec2.InstanceType.of(ec2.InstanceClass.M5, ec2.InstanceSize.XLARGE8).toString()],
      nodegroupName: 'posit-large',
      scalingConfig: {
        desiredSize: 0,
        maxSize: 4,
        minSize: 0
      },
      diskSize: 200
    })

    nodegroupsmall.node.addDependency(this.cluster)
    nodegrouplarge.node.addDependency(this.cluster)

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const clusterNameOutput = new cdk.CfnOutput(this, 'posit-sce-cluster-name', {
      key: 'PositSceClusterName',
      description: 'Posit SCE cluster name',
      value: this.cluster.name!,
    })
  }
}

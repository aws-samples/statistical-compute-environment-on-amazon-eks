import * as cdk from 'aws-cdk-lib'
import { type Construct } from 'constructs'
import * as ec2 from 'aws-cdk-lib/aws-ec2'

interface VpcStackProps extends cdk.StackProps {
  clusterName: string
}

export class VpcStack extends cdk.NestedStack {
  public readonly vpc: ec2.Vpc

  constructor(scope: Construct, id: string, props: VpcStackProps) {
    super(scope, id, props)

    this.vpc = new ec2.Vpc(this, 'posit-sce-eks-vpc')

    for (const subnet of this.vpc.publicSubnets) {
      cdk.Tags.of(subnet).add('kubernetes.io/role/elb', '1')
      cdk.Tags.of(subnet).add(`kubernetes.io/cluster/${props.clusterName}`, 'owned')
    }

    for (const subnet of this.vpc.privateSubnets) {
      cdk.Tags.of(subnet).add('kubernetes.io/role/internal-elb', '1')
      cdk.Tags.of(subnet).add(`kubernetes.io/cluster/${props.clusterName}`, 'owned')
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const vpcOutput = new cdk.CfnOutput(this, 'vpc-id-output', {
      key: 'VPCId',
      value: this.vpc.vpcId
    })
  }
}

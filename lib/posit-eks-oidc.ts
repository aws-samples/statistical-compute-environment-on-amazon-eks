import * as cdk from 'aws-cdk-lib'
import { type Construct } from 'constructs'
import * as eks from 'aws-cdk-lib/aws-eks'
import type * as ec2 from 'aws-cdk-lib/aws-ec2'

interface EksOidcStackProps extends cdk.StackProps {
  cluster: eks.CfnCluster
}

export class EksOidcStack extends cdk.NestedStack {
  public readonly cluster: eks.CfnCluster
  public readonly clusterSg: ec2.SecurityGroup

  constructor(scope: Construct, id: string, props: EksOidcStackProps) {
    super(scope, id, props)

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const oidcProvider = new eks.OpenIdConnectProvider(this, `${props.cluster.name}-oidc-provider`, {
      url: props.cluster.attrOpenIdConnectIssuerUrl
    })
  }
}

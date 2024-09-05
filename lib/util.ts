import * as cdk from 'aws-cdk-lib'

export function getOidcProviderArn(stack: cdk.Stack, openIdConnectIssuerUrl: string): string {
  const clusterID = cdk.Fn.select(1, cdk.Fn.split('amazonaws.com/id/', openIdConnectIssuerUrl))
  return cdk.Stack.of(stack).formatArn({
    service: 'iam',
    region: '',
    resource: 'oidc-provider',
    resourceName: `oidc.eks.${stack.region}.amazonaws.com/id/${clusterID}`,
    arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME
  })
}

export function getOidcProviderResourceArn(stack: cdk.Stack, openIdConnectIssuerUrl: string): string {
  const clusterId = cdk.Fn.select(1, cdk.Fn.split('amazonaws.com/id/', openIdConnectIssuerUrl))
  return `oidc.eks.${stack.region}.amazonaws.com/id/${clusterId}`
}

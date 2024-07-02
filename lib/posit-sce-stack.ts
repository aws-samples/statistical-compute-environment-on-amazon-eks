import * as cdk from 'aws-cdk-lib'
import { type Construct } from 'constructs'
import * as eks from 'aws-cdk-lib/aws-eks'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as iam from 'aws-cdk-lib/aws-iam'
import { EksStack } from './posit-eks'
import { VpcStack } from './posit-network'
import { AddonsStack } from './posit-eks-addons'
import { FilesystemStack } from './posit-filesystem'
import { DbStack } from './posit-db'
import { EksOidcStack } from './posit-eks-oidc'
import { AlbStack } from './posit-eks-alb'
import { NagSuppressions } from 'cdk-nag'
import { ConcurrencyPolicy } from 'cdk8s-plus-25'

export class PositSceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // CDK NAG Supression
    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-VPC7',
        reason: 'Not required for the solution to function and we are not expecting customers to debug teh solution. Can be enabled by customers if needed.'
      },
    ])

    const clusterName = this.node.tryGetContext('clusterName')
    const efsCsiDriverServiceAccountName = this.node.tryGetContext('efsCsiDriverServiceAccountName')
    const vpcCniDriverServiceAccountName = this.node.tryGetContext('vpcCniDriverServiceAccountName')
    const databaseName = this.node.tryGetContext('databaseName')
    const databaseUsername = this.node.tryGetContext('databaseUsername')
    const albControllerServiceAccountName = this.node.tryGetContext('albControllerServiceAccountName')

    const vpcStack = new VpcStack(this, 'posit-sce-eks-vpc', { clusterName, description: 'VPC for Posit ESK Cluster' })

    const eksClusterStack = new EksStack(this, 'posit-sce-eks-cluster', {
      vpc: vpcStack.vpc,
      clusterName
    })

    const oidcConfigStack = new EksOidcStack(this, 'posit-sce-eks-oidc', {
      cluster: eksClusterStack.cluster
    })

    oidcConfigStack.addDependency(eksClusterStack)

    const albStack = new AlbStack(this, 'posit-sce-eks-alb', {
      vpc: vpcStack.vpc,
      cluster: eksClusterStack.cluster,
      albControllerServiceAccountName
    })

    albStack.addDependency(oidcConfigStack)
    const eksClusterSg = ec2.SecurityGroup.fromSecurityGroupId(this, 'eks-cluster-sg', eksClusterStack.cluster.attrClusterSecurityGroupId)
    eksClusterSg.addIngressRule(albStack.securityGroup, ec2.Port.allTcp(), 'Allow traffic from ALB')

    const addonsStack = new AddonsStack(this, 'posit-sce-eks-addons', {
      cluster: eksClusterStack.cluster,
      efsCsiDriverServiceAccountName,
      vpcCniDriverServiceAccountName
    })

    addonsStack.addDependency(oidcConfigStack)

    const clusterAdminRole = new iam.Role(this, 'posit-sce-eks-cluster-admin-role', {
      assumedBy: new iam.AccountRootPrincipal()
    })

    const clusterAdmin = new eks.CfnAccessEntry(this, 'posit-sce-eks-cluster-admin', {
      clusterName: eksClusterStack.cluster.name!,
      principalArn: clusterAdminRole.roleArn,
      accessPolicies: [
        {
          policyArn: `arn:${this.partition}:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy`,
          accessScope: {
            type: 'cluster'
          }
        }
      ]
    })
    clusterAdmin.node.addDependency(eksClusterStack)

    const currentRoleArn = process.env.CURRENT_ROLE_ARN;

    const currentTmpAdmin = new eks.CfnAccessEntry(this, 'posit-sce-cluster-tmp-admin', {
      clusterName: eksClusterStack.cluster.name!,
      principalArn: currentRoleArn!,
      accessPolicies: [
        {
          policyArn: `arn:${this.partition}:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy`,
          accessScope: {
            type: 'cluster'
          }
        }
      ]
    })
    currentTmpAdmin.node.addDependency(eksClusterStack)
  

    const efsStack = new FilesystemStack(this, 'posit-sce-efs', {
      vpc: vpcStack.vpc
    })

    efsStack.addDependency(eksClusterStack)

    efsStack.fileSystemSg.addIngressRule(ec2.Peer.securityGroupId(eksClusterStack.cluster.attrClusterSecurityGroupId), ec2.Port.tcp(2049), 'Allow NFS traffic from Posit EKS cluster')

    const dbClusterStack = new DbStack(this, 'posit-sce-db', {
      vpc: vpcStack.vpc,
      databaseName,
      databaseUsername
    })

    dbClusterStack.clusterSg.addIngressRule(ec2.Peer.securityGroupId(eksClusterStack.cluster.attrClusterSecurityGroupId), ec2.Port.tcp(dbClusterStack.cluster.clusterEndpoint.port), 'Allow traffic from Posit EKS cluster')

  }
}

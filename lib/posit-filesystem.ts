import * as cdk from 'aws-cdk-lib'
import { type Construct } from 'constructs'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as efs from 'aws-cdk-lib/aws-efs'

interface FilesystemStackProps extends cdk.StackProps {
  vpc: ec2.Vpc
}

export class FilesystemStack extends cdk.NestedStack {
  public readonly fileSystem: efs.FileSystem
  public readonly fileSystemSg: ec2.SecurityGroup

  constructor(scope: Construct, id: string, props: FilesystemStackProps) {
    super(scope, id, props)

    this.fileSystemSg = new ec2.SecurityGroup(this, 'post-postgres-efs-sg', {
      description: 'SG for Posit EFS',
      vpc: props.vpc,
      allowAllOutbound: true
    })

    this.fileSystem = new efs.FileSystem(this, 'posit-sce-efs', {
      vpc: props.vpc,
      encrypted: true,
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_14_DAYS,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
      throughputMode: efs.ThroughputMode.ELASTIC,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      securityGroup: this.fileSystemSg,
      allowAnonymousAccess: true
    })

    const workbenchSharedAccessPoint = new efs.AccessPoint(this, 'posit-sce-workbench-ap-shared', {
      fileSystem: this.fileSystem,
      path: '/workbench/shared',
      createAcl: {
        ownerGid: '1000',
        ownerUid: '1000',
        permissions: '0755'
      }
    })

    cdk.Tags.of(workbenchSharedAccessPoint).add('Name', 'Workbench_Shared')

    const workbenchUserAccessPoint = new efs.AccessPoint(this, 'posit-sce-efs-workbench-ap-user', {
      fileSystem: this.fileSystem,
      path: '/workbench/user',
      createAcl: {
        ownerGid: '1000',
        ownerUid: '1000',
        permissions: '0755'
      }
    })

    cdk.Tags.of(workbenchUserAccessPoint).add('Name', 'Workbench_User')

    const connectAccessPoint = new efs.AccessPoint(this, 'posit-sce-efs-connect', {
      fileSystem: this.fileSystem,
      path: '/connect',
      createAcl: {
        ownerGid: '1000',
        ownerUid: '1000',
        permissions: '0755'
      }
    })

    cdk.Tags.of(connectAccessPoint).add('Name', 'Connect')

    const packmanAccessPoint = new efs.AccessPoint(this, 'posit-sce-efs-packman', {
      fileSystem: this.fileSystem,
      path: '/packman',
      createAcl: {
        ownerGid: '999',
        ownerUid: '999',
        permissions: '0777'
      },
      posixUser: {
        uid: '999',
        gid: '999'
      }
    })

    cdk.Tags.of(packmanAccessPoint).add('Name', 'Packman')

    const efsIdOutput = new cdk.CfnOutput(this, 'posit-efs-id', {
      key: 'EfsFileSystemId',
      description: 'EFS File System ID for Posit',
      value: this.fileSystem.fileSystemId
    })
  }
}

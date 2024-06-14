import * as cdk from 'aws-cdk-lib'
import { type Construct } from 'constructs'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as rds from 'aws-cdk-lib/aws-rds'

interface DbStackProps extends cdk.StackProps {
  vpc: ec2.Vpc
  databaseName: string
  databaseUsername: string
}

export class DbStack extends cdk.NestedStack {
  cluster: rds.DatabaseCluster
  clusterSg: ec2.SecurityGroup

  constructor(scope: Construct, id: string, props: DbStackProps) {
    super(scope, id, props)

    const databaseCredentials = rds.Credentials.fromGeneratedSecret(props.databaseUsername, {
      secretName: id,
      excludeCharacters: '!@#$%^&*()`-_=+[]{}\\|;:\'",.<>/?'
    })

    this.clusterSg = new ec2.SecurityGroup(this, 'post-postgres-db-sg', {
      description: 'SG for Posit PostrgreSQL',
      vpc: props.vpc,
      allowAllOutbound: true
    })

    this.cluster = new rds.DatabaseCluster(this, 'postrgresql-db', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({ version: rds.AuroraPostgresEngineVersion.VER_15_5 }),
      defaultDatabaseName: props.databaseName,
      credentials: databaseCredentials,
      storageEncrypted: true,
      writer: rds.ClusterInstance.provisioned('writer', {
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.R6G, ec2.InstanceSize.XLARGE),
      }),
      vpc: props.vpc,
      securityGroups: [this.clusterSg]
    })

    const postgresConnectionOutput = new cdk.CfnOutput(this, 'posit-postgres-db-secret', {
      key: 'PostgresSecret',
      description: 'Connection info for the DB stored in SecretsManager',
      value: `${databaseCredentials.secretName}`
    })
  }
}

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as rds from "aws-cdk-lib/aws-rds";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";

export class MultiAZStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "vpc", {
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 28,
        },
      ],
    });

    const databaseSg = new ec2.SecurityGroup(this, "databaseSg", {
      vpc: vpc,
    });

    const devDatabase = new rds.DatabaseInstance(this, "devDatabase", {
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0_28,
      }),
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      allocatedStorage: 20,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      multiAz: true,
      securityGroups: [databaseSg],
      deleteAutomatedBackups: true,
      backupRetention: cdk.Duration.days(0),
      instanceIdentifier: "dev",
    });

    const prodDatabase = new rds.DatabaseInstance(this, "prodDatabase", {
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0_28,
      }),
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      allocatedStorage: 20,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      availabilityZone: vpc.publicSubnets[0].availabilityZone,
      securityGroups: [databaseSg],
      deleteAutomatedBackups: true,
      backupRetention: cdk.Duration.days(0),
      instanceIdentifier: "prod",
    });

    const role = new iam.Role(this, "role", {
      roleName: "week4-multi-az-role",
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
    });

    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess")
    );

    const tempUserData = ec2.UserData.forLinux();
    tempUserData.addCommands("yum install -y mysql jq");
    tempUserData.addCommands(
      `aws secretsmanager get-secret-value --secret-id ${
        prodDatabase.secret!.secretName
      } --region $(curl http://169.254.169.254/latest/meta-data/placement/region) | jq -r '.SecretString' > /tmp/db_credentials`
    );
    tempUserData.addCommands(
      "aws s3 cp s3://youngwjung/awslabs/week4-multi-az.sh /home/ec2-user/",
      "bash /home/ec2-user/week4-multi-az.sh"
    );

    const tempInstanceSg = new ec2.SecurityGroup(this, "tempInstanceSg", {
      vpc: vpc,
    });

    prodDatabase.connections.allowDefaultPortFrom(tempInstanceSg);

    const tempInstance = new ec2.Instance(this, "tempInstance", {
      vpc: vpc,
      availabilityZone: vpc.publicSubnets[0].availabilityZone,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      userData: tempUserData,
      securityGroup: tempInstanceSg,
      role: role,
    });

    tempInstance.node.addDependency(prodDatabase);

    const instance = new ec2.Instance(this, "instance", {
      vpc: vpc,
      availabilityZone: vpc.publicSubnets[0].availabilityZone,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
    });

    instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonEC2RoleforSSM"
      )
    );

    for (let i = 1; i <= 10; i++) {
      new ec2.CfnNetworkInterface(this, `eni-${i}`, {
        subnetId: vpc.publicSubnets[1].subnetId,
      });
    }

    new cdk.CfnOutput(this, "RdsConnectionInfo", {
      value: prodDatabase.secret!.secretName,
    });

    new cdk.CfnOutput(this, "RdsInstanceName", {
      value: prodDatabase.instanceIdentifier,
    });

    new cdk.CfnOutput(this, "InstanceId", {
      value: instance.instanceId,
    });
  }
}

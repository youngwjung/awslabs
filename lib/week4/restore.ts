import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as rds from "aws-cdk-lib/aws-rds";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cr from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";

export class RestoreStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "vpc", {
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    const mysql = new rds.DatabaseInstance(this, "mysql", {
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
      deleteAutomatedBackups: true,
    });

    const role = new iam.Role(this, "role", {
      roleName: "week4-restore-role",
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
    });

    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess")
    );

    const tempUserData = ec2.UserData.forLinux();
    tempUserData.addCommands(
      "dnf update -y && dnf install -y mariadb105-server"
    );
    tempUserData.addCommands(
      'TOKEN=`curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600"`'
    );
    tempUserData.addCommands(
      `aws secretsmanager get-secret-value --secret-id ${
        mysql.secret!.secretName
      } --region $(curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/placement/region) | jq -r '.SecretString' > /tmp/db_credentials`
    );
    tempUserData.addCommands(
      "aws s3 cp s3://youngwjung/awslabs/week4-restore.sh /home/ec2-user/",
      "bash /home/ec2-user/week4-restore.sh"
    );

    const tempInstanceSg = new ec2.SecurityGroup(this, "tempInstanceSg", {
      vpc: vpc,
    });

    mysql.connections.allowDefaultPortFrom(tempInstanceSg);

    const tempInstance = new ec2.Instance(this, "tempInstance", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      userData: tempUserData,
      securityGroup: tempInstanceSg,
      role: role,
    });

    tempInstance.node.addDependency(mysql);

    const instance = new ec2.Instance(this, "instance", {
      vpc: vpc,
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

    const delayGenerator = new lambda.Function(this, "delayGenerator", {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset("lambda/wait"),
      handler: "app.on_event",
      timeout: cdk.Duration.minutes(15),
    });

    const delayProvider = new cr.Provider(this, "delayProvider", {
      onEventHandler: delayGenerator,
    });

    const delay = new cdk.CustomResource(this, "delay", {
      serviceToken: delayProvider.serviceToken,
      properties: {
        time: 600,
      },
    });

    delay.node.addDependency(tempInstance);

    new cdk.CfnOutput(this, "RdsInstanceName", {
      value: mysql.instanceIdentifier,
    });

    new cdk.CfnOutput(this, "RdsConnectionInfo", {
      value: mysql.secret!.secretName,
    });

    new cdk.CfnOutput(this, "InstanceId", {
      value: instance.instanceId,
    });
  }
}

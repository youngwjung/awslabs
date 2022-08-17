import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as rds from "aws-cdk-lib/aws-rds";
import * as sm from "aws-cdk-lib/aws-secretsmanager";
import * as kms from "aws-cdk-lib/aws-kms";
import { Construct } from "constructs";

export class KmsStack extends cdk.Stack {
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

    const encryptionKey = new kms.Key(this, "encryptionKey", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pendingWindow: cdk.Duration.days(7),
    });

    const dbSecret = new sm.Secret(this, "dbSecret", {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "admin" }),
        generateStringKey: "password",
        excludePunctuation: true,
        passwordLength: 20,
      },
      encryptionKey: encryptionKey,
    });

    const randomString = new sm.Secret(this, "randomString", {
      generateSecretString: {
        passwordLength: 10,
        excludePunctuation: true,
      },
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
      credentials: rds.Credentials.fromSecret(dbSecret),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
    });

    mysql.connections.allowDefaultPortFromAnyIpv4();

    const tempUserData = ec2.UserData.forLinux();
    tempUserData.addCommands("yum install -y mysql jq");
    tempUserData.addCommands(
      `aws secretsmanager get-secret-value --secret-id ${dbSecret.secretName} --region $(curl http://169.254.169.254/latest/meta-data/placement/region) | jq -r '.SecretString' > /tmp/db_credentials`
    );
    tempUserData.addCommands(
      "cat <<EOF >> /tmp/db.sql",
      "CREATE DATABASE secret;",
      "USE secret;",
      "CREATE TABLE IF NOT EXISTS secret (id INT AUTO_INCREMENT, value VARCHAR(255) NOT NULL, PRIMARY KEY (id));",
      `INSERT INTO secret (value) VALUES ("$(aws kms encrypt --key-id ${encryptionKey.keyId} --plaintext $(aws secretsmanager get-secret-value --secret-id ${randomString.secretName} --region $(curl http://169.254.169.254/latest/meta-data/placement/region) | jq -r '.SecretString') --region $(curl http://169.254.169.254/latest/meta-data/placement/region) --output text --query CiphertextBlob)");`,
      "EOF"
    );
    tempUserData.addCommands(
      "mysql -h $(cat /tmp/db_credentials | jq -r '.host') -u $(cat /tmp/db_credentials | jq -r '.username') -p$(cat /tmp/db_credentials | jq -r '.password') < /tmp/db.sql"
    );

    const tempInstance = new ec2.Instance(this, "tempInstance", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      userData: tempUserData,
      userDataCausesReplacement: true,
    });

    tempInstance.node.addDependency(mysql);

    tempInstance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess")
    );

    const userData = ec2.UserData.forLinux();
    userData.addCommands("yum install -y mysql jq");

    const instance = new ec2.Instance(this, "instance", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      userData: userData,
      userDataCausesReplacement: true,
    });

    instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonEC2RoleforSSM"
      )
    );

    const iamUser = new iam.User(this, "iamUser", {
      password: new cdk.SecretValue("Asdf!23456"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("ReadOnlyAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2FullAccess"),
      ],
    });

    new cdk.CfnOutput(this, "RdsConnectionInfo", {
      value: dbSecret.secretName,
    });

    new cdk.CfnOutput(this, "KmsKey", {
      value: encryptionKey.keyId,
    });

    new cdk.CfnOutput(this, "Answer", {
      value: randomString.secretName,
    });

    new cdk.CfnOutput(this, "UserName", {
      value: iamUser.userName,
    });

    new cdk.CfnOutput(this, "UserPassword", {
      value: "Asdf!23456",
    });

    new cdk.CfnOutput(this, "SignInURL", {
      value: `https://${this.account}.signin.aws.amazon.com/console`,
    });
  }
}

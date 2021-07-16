import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as iam from "@aws-cdk/aws-iam";
import * as rds from "@aws-cdk/aws-rds";
import * as sm from "@aws-cdk/aws-secretsmanager";
import * as kms from "@aws-cdk/aws-kms";
import { CfnOutput } from "@aws-cdk/core";

export class KmsStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
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

    const encryption_key = new kms.Key(this, "encryption_key", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pendingWindow: cdk.Duration.days(7),
    });

    const db_secret = new sm.Secret(this, "db_secret", {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "admin" }),
        generateStringKey: "password",
        excludePunctuation: true,
        passwordLength: 20,
      },
      encryptionKey: encryption_key,
    });

    const random_string = new sm.Secret(this, "random_string", {
      generateSecretString: {
        passwordLength: 10,
        excludePunctuation: true,
      },
    });

    const mysql = new rds.DatabaseInstance(this, "mysql", {
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0_21,
      }),
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      allocatedStorage: 20,
      credentials: rds.Credentials.fromSecret(db_secret),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
    });

    mysql.connections.allowDefaultPortFromAnyIpv4();

    const temp_user_data = ec2.UserData.forLinux();
    temp_user_data.addCommands("yum install -y mysql jq");
    temp_user_data.addCommands(
      `aws secretsmanager get-secret-value --secret-id ${db_secret.secretName} --region $(curl http://169.254.169.254/latest/meta-data/placement/region) | jq -r '.SecretString' > /tmp/db_credentials`
    );
    temp_user_data.addCommands(
      "cat <<EOF >> /tmp/db.sql",
      "CREATE DATABASE secret;",
      "USE secret;",
      "CREATE TABLE IF NOT EXISTS secret (id INT AUTO_INCREMENT, value VARCHAR(255) NOT NULL, PRIMARY KEY (id));",
      `INSERT INTO secret (value) VALUES ("$(aws kms encrypt --key-id ${encryption_key.keyId} --plaintext $(aws secretsmanager get-secret-value --secret-id ${random_string.secretName} --region $(curl http://169.254.169.254/latest/meta-data/placement/region) | jq -r '.SecretString') --region $(curl http://169.254.169.254/latest/meta-data/placement/region) --output text --query CiphertextBlob)");`,
      "EOF"
    );
    temp_user_data.addCommands(
      "mysql -h $(cat /tmp/db_credentials | jq -r '.host') -u $(cat /tmp/db_credentials | jq -r '.username') -p$(cat /tmp/db_credentials | jq -r '.password') < /tmp/db.sql"
    );

    const temp_instance = new ec2.Instance(this, "temp_instance", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      userData: temp_user_data,
      userDataCausesReplacement: true,
    });

    temp_instance.node.addDependency(mysql);

    temp_instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess")
    );

    const user_data = ec2.UserData.forLinux();
    user_data.addCommands("yum install -y mysql jq");

    const instance = new ec2.Instance(this, "instance", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      userData: user_data,
      userDataCausesReplacement: true,
    });

    instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonEC2RoleforSSM"
      )
    );

    const iam_user = new iam.User(this, "iam_user", {
      password: new cdk.SecretValue("Asdf!23456"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("ReadOnlyAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2FullAccess"),
      ],
    });

    new CfnOutput(this, "rds_credentials", {
      value: db_secret.secretName,
    });

    new CfnOutput(this, "rds_encryption_key", {
      value: encryption_key.keyId,
    });

    new CfnOutput(this, "db_record_value", {
      value: random_string.secretName,
    });

    new CfnOutput(this, "iam_user_name", {
      value: iam_user.userName,
    });

    new CfnOutput(this, "iam_user_password", {
      value: "Asdf!23456",
    });

    new CfnOutput(this, "sign_in_url", {
      value: `https://${this.account}.signin.aws.amazon.com/console`,
    });
  }
}

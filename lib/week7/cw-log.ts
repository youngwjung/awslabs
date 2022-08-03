import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as rds from "aws-cdk-lib/aws-rds";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";

export class CwlogStack extends cdk.Stack {
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

    const postgres = new rds.DatabaseInstance(this, "postgres", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_10_20,
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
    });

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "yum update -y && yum install -y httpd httpd-devel git python3-3.7* jq python3-devel postgresql-devel gcc"
    );
    userData.addCommands("pip3 install flask psycopg2 mod_wsgi");
    userData.addCommands(
      "git clone https://github.com/youngwjung/flask-db.git /var/www/html/"
    );
    userData.addCommands(
      `aws secretsmanager get-secret-value --secret-id ${
        postgres.secret!.secretName
      } --region $(curl http://169.254.169.254/latest/meta-data/placement/region) | jq -r '.SecretString' > /var/www/html/db_credentials`
    );
    userData.addCommands("mv /var/www/html/app.conf /etc/httpd/conf.d/");
    userData.addCommands("systemctl enable httpd");
    userData.addCommands("systemctl start httpd");
    userData.addCommands("curl localhost");

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

    instance.node.addDependency(postgres);

    instance.connections.allowFromAnyIpv4(ec2.Port.tcp(80));

    instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonEC2RoleforSSM"
      )
    );

    instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("SecretsManagerReadWrite")
    );

    const cwToSns = new lambda.Function(this, "cwToSns", {
      runtime: lambda.Runtime.PYTHON_3_7,
      code: lambda.Code.fromAsset("lambda/cw-to-sns"),
      handler: "app.lambda_handler",
      timeout: cdk.Duration.seconds(300),
    });

    cwToSns.addEnvironment("SNS_ARN", "");

    cwToSns.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["sns:Publish"],
        resources: ["*"],
        effect: iam.Effect.ALLOW,
      })
    );

    new CfnOutput(this, "webServerIP", {
      value: instance.instancePublicIp,
    });

    new CfnOutput(this, "webServerErrorPage", {
      value: `${instance.instancePublicIp}/error`,
    });

    new CfnOutput(this, "lambdaFunctionName", {
      value: cwToSns.functionName,
    });
  }
}

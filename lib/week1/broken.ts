import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cr from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";

export class BrokenStack extends cdk.Stack {
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

    const role = new iam.Role(this, "role", {
      roleName: "week1-broken-role",
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
    });

    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")
    );

    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess")
    );

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "aws s3 cp s3://youngwjung/awslabs/week1-broken.sh /home/ec2-user/",
      "bash /home/ec2-user/week1-broken.sh",
      "rm /home/ec2-user/week1-broken.sh"
    );

    const instance = new ec2.Instance(this, "instance", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      userData: userData,
      role: role,
    });

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
  }
}

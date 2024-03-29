import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export class EbsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const keyPair = new cdk.CfnParameter(this, "keyPair", {
      type: "AWS::EC2::KeyPair::KeyName",
      description: "An Amazon EC2 key pair name.",
    });

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
      roleName: "week1-ebs-role",
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
      "aws s3 cp s3://youngwjung/awslabs/week1-ebs.sh /home/ec2-user/",
      "bash /home/ec2-user/week1-ebs.sh"
    );

    const instance = new ec2.Instance(this, "instance", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      userData: userData,
      keyName: keyPair.valueAsString,
      role: role,
    });

    new cdk.CfnOutput(this, "InstanceId", {
      value: instance.instanceId,
    });
  }
}

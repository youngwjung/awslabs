import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export class StsStack extends cdk.Stack {
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

    const iamUser = new iam.User(this, "iamUser");

    const accessKey = new iam.CfnAccessKey(this, "accessKey", {
      userName: iamUser.userName,
    });

    const userData = ec2.UserData.forLinux();
    userData.addCommands("mkdir /home/ec2-user/.aws");
    userData.addCommands(
      "cat <<EOF >> /home/ec2-user/.aws/credentials",
      "[default]",
      `aws_access_key_id=${accessKey.ref}`,
      `aws_secret_access_key=${accessKey.attrSecretAccessKey}`,
      "EOF"
    );
    userData.addCommands(
      "cat <<EOF >> /home/ec2-user/.aws/config",
      "[default]",
      "region=$(curl http://169.254.169.254/latest/meta-data/placement/region)",
      "output=json",
      "EOF"
    );

    const instance = new ec2.Instance(this, "instance", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      userData: userData,
      userDataCausesReplacement: true,
    });

    instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonEC2RoleforSSM"
      )
    );

    const iamRole = new iam.Role(this, "iamRole", {
      assumedBy: new iam.AccountPrincipal("287997882978"),
    });

    iamRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3ReadOnlyAccess")
    );

    new cdk.CfnOutput(this, "UserName", {
      value: iamUser.userName,
    });

    new cdk.CfnOutput(this, "UserArn", {
      value: iamUser.userArn,
    });

    new cdk.CfnOutput(this, "RoleArn", {
      value: iamRole.roleArn,
    });

    new cdk.CfnOutput(this, "RoleName", {
      value: iamRole.roleName,
    });

    new cdk.CfnOutput(this, "InstanceId", {
      value: instance.instanceId,
    });
  }
}

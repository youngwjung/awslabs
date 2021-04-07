import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as iam from "@aws-cdk/aws-iam";
import { CfnOutput } from "@aws-cdk/core";

export class StsStack extends cdk.Stack {
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

    const iam_user = new iam.User(this, "iam_user");

    const access_key = new iam.CfnAccessKey(this, "access_key", {
      userName: iam_user.userName,
    });

    const user_data = ec2.UserData.forLinux();
    user_data.addCommands("mkdir /home/ec2-user/.aws");
    user_data.addCommands(
      "cat <<EOF >> /home/ec2-user/.aws/credentials",
      "[default]",
      `aws_access_key_id=${access_key.ref}`,
      `aws_secret_access_key=${access_key.attrSecretAccessKey}`,
      "EOF"
    );
    user_data.addCommands(
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

    const iam_role = new iam.Role(this, "iam_role", {
      assumedBy: new iam.AccountPrincipal("287997882978"),
    });

    iam_role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3ReadOnlyAccess")
    );

    new CfnOutput(this, "iam_user_name", {
      value: iam_user.userName,
    });

    new CfnOutput(this, "iam_user_arn", {
      value: iam_user.userArn,
    });

    new CfnOutput(this, "iam_role_arn", {
      value: iam_role.roleArn,
    });

    new CfnOutput(this, "iam_role_name", {
      value: iam_role.roleName,
    });
  }
}

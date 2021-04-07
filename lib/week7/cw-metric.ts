import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as iam from "@aws-cdk/aws-iam";

export class CwmetricStack extends cdk.Stack {
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

    const user_data = ec2.UserData.forLinux();
    user_data.addCommands(
      "fallocate -l $(($(df / | tail -1 | tr -s ' ' | cut -d' ' -f4) * 999)) /tmp/file"
    );
    user_data.addCommands(
      `python -c "x = [str(i**2) for i in range(5000000)];print(x)" >> /tmp/result.log`
    );
    user_data.addCommands(
      `python -c "x = [str(i**2) for i in range(5000000)];print(x)" >> /tmp/result.log`
    );
    user_data.addCommands(
      `python -c "x = [str(i**2) for i in range(5000000)];print(x)" >> /tmp/result.log`
    );
    user_data.addCommands(
      `python -c "x = [str(i**2) for i in range(5000000)];print(x)" >> /tmp/result.log`
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

    instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchAgentServerPolicy")
    );
  }
}

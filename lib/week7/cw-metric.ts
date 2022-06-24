import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export class CwmetricStack extends cdk.Stack {
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

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "fallocate -l $(($(df / | tail -1 | tr -s ' ' | cut -d' ' -f4) * 999)) /tmp/file"
    );
    userData.addCommands(
      `python -c "x = [str(i**2) for i in range(5000000)];print(x)" >> /tmp/result.log`
    );
    userData.addCommands(
      `python -c "x = [str(i**2) for i in range(5000000)];print(x)" >> /tmp/result.log`
    );
    userData.addCommands(
      `python -c "x = [str(i**2) for i in range(5000000)];print(x)" >> /tmp/result.log`
    );
    userData.addCommands(
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
      userData: userData,
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

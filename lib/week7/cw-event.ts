import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as autoscaling from "@aws-cdk/aws-autoscaling";
import * as lambda from "@aws-cdk/aws-lambda";
import { CfnOutput } from "@aws-cdk/core";

export class CweventStack extends cdk.Stack {
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

    const asg = new autoscaling.AutoScalingGroup(this, "asg", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      minCapacity: 1,
      maxCapacity: 4,
    });

    const slack_notification = new lambda.Function(this, "slack_notification", {
      runtime: lambda.Runtime.PYTHON_3_7,
      code: lambda.Code.fromAsset("lambda/slack-notification"),
      handler: "app.lambda_handler",
      timeout: cdk.Duration.seconds(300),
    });

    slack_notification.addEnvironment("SLACK_CHANNEL", "");
    slack_notification.addEnvironment("WEBHOOK_URL", "");

    new CfnOutput(this, "LambdaFunctionName", {
      value: slack_notification.functionName,
    });

    new CfnOutput(this, "AutoScalingGroupName", {
      value: asg.autoScalingGroupName,
    });
  }
}

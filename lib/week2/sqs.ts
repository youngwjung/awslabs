import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as cw from "aws-cdk-lib/aws-cloudwatch";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export class SqsStack extends cdk.Stack {
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

    const queue = new sqs.Queue(this, "queue");

    const queueUrl = new ssm.StringParameter(this, "queueUrl", {
      parameterName: "week2_sqs_url",
      stringValue: queue.queueUrl,
    });

    const metric = queue.metricApproximateNumberOfMessagesVisible({
      period: cdk.Duration.minutes(1),
      statistic: "Sum",
    });

    const senderUserData = ec2.UserData.forLinux();
    senderUserData.addCommands(
      "yum update -y && yum install -y git python3-3.7*"
    );
    senderUserData.addCommands("pip3 install boto3 requests");
    senderUserData.addCommands(
      "cd /home/ec2-user/ && git clone https://github.com/youngwjung/sqs-demo.git"
    );
    senderUserData.addCommands(
      "nohup python3 /home/ec2-user/sqs-demo/sender.py &"
    );

    const senderInstance = new ec2.Instance(this, "senderInstance", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      userData: senderUserData,
    });

    senderInstance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonEC2RoleforSSM"
      )
    );
    senderInstance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSQSFullAccess")
    );
    senderInstance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMFullAccess")
    );

    const asgUserData = ec2.UserData.forLinux();
    asgUserData.addCommands(
      "yum update -y && yum install -y httpd git python3-3.7*"
    );
    asgUserData.addCommands("pip3 install boto3 requests");
    asgUserData.addCommands(
      "cd /home/ec2-user/ && git clone https://github.com/youngwjung/sqs-demo.git"
    );
    asgUserData.addCommands(
      "nohup python3 /home/ec2-user/sqs-demo/worker.py &"
    );

    const asg = new autoscaling.AutoScalingGroup(this, "asg", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      maxCapacity: 4,
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      userData: asgUserData,
    });

    asg.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonEC2RoleforSSM"
      )
    );
    asg.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSQSFullAccess")
    );
    asg.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMFullAccess")
    );

    const scaleOutAction = new autoscaling.CfnScalingPolicy(
      this,
      "scaleOutAction",
      {
        autoScalingGroupName: asg.autoScalingGroupName,
        adjustmentType: "ChangeInCapacity",
        scalingAdjustment: 1,
      }
    );

    const scaleOut = new cw.CfnAlarm(this, "scaleOut", {
      comparisonOperator: "GreaterThanOrEqualToThreshold",
      evaluationPeriods: 1,
      alarmActions: [scaleOutAction.ref],
      statistic: "Sum",
      threshold: 10,
      period: 60,
      namespace: metric.namespace,
      metricName: metric.metricName,
      dimensions: [
        {
          name: "QueueName",
          value: queue.queueName,
        },
      ],
    });

    const scaleInAction = new autoscaling.CfnScalingPolicy(
      this,
      "scaleInAction",
      {
        autoScalingGroupName: asg.autoScalingGroupName,
        adjustmentType: "ChangeInCapacity",
        scalingAdjustment: -1,
      }
    );

    const scaleIn = new cw.CfnAlarm(this, "scaleIn", {
      comparisonOperator: "LessThanOrEqualToThreshold",
      evaluationPeriods: 1,
      alarmActions: [scaleInAction.ref],
      statistic: "Sum",
      threshold: 5,
      period: 60,
      namespace: metric.namespace,
      metricName: metric.metricName,
      dimensions: [
        {
          name: "QueueName",
          value: queue.queueName,
        },
      ],
    });
  }
}

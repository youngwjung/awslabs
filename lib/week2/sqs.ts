import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as autoscaling from "@aws-cdk/aws-autoscaling";
import * as sqs from "@aws-cdk/aws-sqs";
import * as cw from "@aws-cdk/aws-cloudwatch";
import * as ssm from "@aws-cdk/aws-ssm";
import * as iam from "@aws-cdk/aws-iam";
import { AutoScalingAction } from "@aws-cdk/aws-cloudwatch-actions";

export class SqsStack extends cdk.Stack {
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

    const queue = new sqs.Queue(this, "queue");

    const queue_url = new ssm.StringParameter(this, "queue_url", {
      parameterName: "week2_sqs_url",
      stringValue: queue.queueUrl,
    });

    const metric = queue.metricApproximateNumberOfMessagesVisible({
      period: cdk.Duration.minutes(1),
      statistic: "Sum",
    });

    const sender_user_data = ec2.UserData.forLinux();
    sender_user_data.addCommands(
      "yum update -y && yum install -y git python3-3.7*"
    );
    sender_user_data.addCommands("pip3 install boto3 requests");
    sender_user_data.addCommands(
      "cd /home/ec2-user/ && git clone https://github.com/youngwjung/sqs-demo.git"
    );
    sender_user_data.addCommands(
      "nohup python3 /home/ec2-user/sqs-demo/sender.py &"
    );

    const sender_instance = new ec2.Instance(this, "sender_instance", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      userData: sender_user_data,
    });

    sender_instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonEC2RoleforSSM"
      )
    );
    sender_instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSQSFullAccess")
    );
    sender_instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMFullAccess")
    );

    const asg_user_data = ec2.UserData.forLinux();
    asg_user_data.addCommands(
      "yum update -y && yum install -y httpd git python3-3.7*"
    );
    asg_user_data.addCommands("pip3 install boto3 requests");
    asg_user_data.addCommands(
      "cd /home/ec2-user/ && git clone https://github.com/youngwjung/sqs-demo.git"
    );
    asg_user_data.addCommands(
      "nohup python3 /home/ec2-user/sqs-demo/worker.py &"
    );

    const asg = new autoscaling.AutoScalingGroup(this, "asg", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      maxCapacity: 4,
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      userData: asg_user_data,
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

    const scale_out_action = new autoscaling.CfnScalingPolicy(
      this,
      "scale_out_action",
      {
        autoScalingGroupName: asg.autoScalingGroupName,
        adjustmentType: "ChangeInCapacity",
        scalingAdjustment: 1,
      }
    );

    const scale_out = new cw.CfnAlarm(this, "scale_out", {
      comparisonOperator: "GreaterThanOrEqualToThreshold",
      evaluationPeriods: 1,
      alarmActions: [scale_out_action.ref],
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

    const scale_in_action = new autoscaling.CfnScalingPolicy(
      this,
      "scale_in_action",
      {
        autoScalingGroupName: asg.autoScalingGroupName,
        adjustmentType: "ChangeInCapacity",
        scalingAdjustment: -1,
      }
    );

    const scale_in = new cw.CfnAlarm(this, "scale_in", {
      comparisonOperator: "LessThanOrEqualToThreshold",
      evaluationPeriods: 1,
      alarmActions: [scale_in_action.ref],
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

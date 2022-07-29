import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as s3 from "aws-cdk-lib/aws-s3";
import { CfnOutput } from "aws-cdk-lib";
import { InstanceTarget } from "aws-cdk-lib/aws-elasticloadbalancingv2-targets";
import { Construct } from "constructs";

export class AlblogStack extends cdk.Stack {
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
    userData.addCommands("yum update -y && yum install -y httpd git");
    userData.addCommands(
      "cd /var/www/html && git clone https://github.com/youngwjung/static-html-sample.git ."
    );
    userData.addCommands("systemctl enable httpd");
    userData.addCommands("systemctl start httpd");

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
    });

    const albLogBucket = new s3.Bucket(this, "albLogBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const lb = new elbv2.ApplicationLoadBalancer(this, "lb", {
      vpc: vpc,
      internetFacing: true,
    });

    lb.logAccessLogs(albLogBucket);

    const httpListener = lb.addListener("httpListener", {
      port: 80,
      open: true,
    });

    httpListener.addTargets("webTarget", {
      port: 80,
      targets: [new InstanceTarget(instance)],
    });

    instance.connections.allowFrom(lb, ec2.Port.tcp(80));

    const zombieUserData = ec2.UserData.forLinux();
    zombieUserData.addCommands(
      "yum update -y && yum install -y python3 python3-devel gcc"
    );
    zombieUserData.addCommands("pip3 install locust");
    zombieUserData.addCommands(
      "cat <<EOF >> /home/ec2-user/locust.py",
      "import time",
      "from locust import HttpUser, task",
      "",
      "class Zombie(HttpUser):",
      "    @task",
      "    def index(self):",
      "        self.client.get('/')",
      "",
      "    wait_time = between(0.1, 0.5)",
      "EOF"
    );
    zombieUserData.addCommands(
      `locust -f /home/ec2-user/locust.py --headless -u $(shuf -i 1-5 -n 1) -r $(shuf -i 1-5 -n 1) --host http://${lb.loadBalancerDnsName}`
    );

    const asg = new autoscaling.AutoScalingGroup(this, "asg", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.SMALL
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      userData: zombieUserData,
      minCapacity: 4,
      maxCapacity: 4,
    });

    new CfnOutput(this, "siteUrl", {
      value: lb.loadBalancerDnsName,
    });

    new CfnOutput(this, "logBucket", {
      value: albLogBucket.bucketName,
    });
  }
}

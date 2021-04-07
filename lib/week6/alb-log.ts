import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as elbv2 from "@aws-cdk/aws-elasticloadbalancingv2";
import * as autoscaling from "@aws-cdk/aws-autoscaling";
import * as s3 from "@aws-cdk/aws-s3";
import { CfnOutput } from "@aws-cdk/core";
import { InstanceTarget } from "@aws-cdk/aws-elasticloadbalancingv2-targets";

export class AlblogStack extends cdk.Stack {
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
    user_data.addCommands("yum update -y && yum install -y httpd git");
    user_data.addCommands(
      "cd /var/www/html && git clone https://github.com/youngwjung/static-html-sample.git ."
    );
    user_data.addCommands("systemctl enable httpd");
    user_data.addCommands("systemctl start httpd");

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
    });

    const alb_log_bucket = new s3.Bucket(this, "alb_log_bucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const lb = new elbv2.ApplicationLoadBalancer(this, "lb", {
      vpc: vpc,
      internetFacing: true,
    });

    lb.logAccessLogs(alb_log_bucket);

    const http_listener = lb.addListener("http_listener", {
      port: 80,
      open: true,
    });

    http_listener.addTargets("web_target", {
      port: 80,
      targets: [new InstanceTarget(instance)],
    });

    instance.connections.allowFrom(lb, ec2.Port.tcp(80));

    const zombie_user_data = ec2.UserData.forLinux();
    zombie_user_data.addCommands(
      "yum update -y && yum install -y python3 python3-devel gcc"
    );
    zombie_user_data.addCommands("pip3 install locust");
    zombie_user_data.addCommands(
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
    zombie_user_data.addCommands(
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
      userData: zombie_user_data,
      minCapacity: 4,
      maxCapacity: 4,
    });

    new CfnOutput(this, "output_site_url", {
      value: lb.loadBalancerDnsName,
    });

    new CfnOutput(this, "log_bucket", {
      value: alb_log_bucket.bucketName,
    });
  }
}

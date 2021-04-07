import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as elbv2 from "@aws-cdk/aws-elasticloadbalancingv2";
import * as autoscaling from "@aws-cdk/aws-autoscaling";
import { CfnOutput } from "@aws-cdk/core";

export class AsgStack extends cdk.Stack {
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
    user_data.addCommands("yum update -y && yum install -y httpd");
    user_data.addCommands(
      "curl http://169.254.169.254/latest/meta-data/public-ipv4 > /tmp/ip.txt"
    );
    user_data.addCommands("cp /tmp/ip.txt /var/www/html/index.html");
    user_data.addCommands("## Simulate booting time by sleep command");
    user_data.addCommands("sleep 300");
    user_data.addCommands("systemctl enable httpd");
    user_data.addCommands("systemctl start httpd");

    const asg = new autoscaling.AutoScalingGroup(this, "asg", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      userData: user_data,
      healthCheck: {
        type: "ELB",
        gracePeriod: cdk.Duration.seconds(60),
      },
    });

    const lb = new elbv2.ApplicationLoadBalancer(this, "lb", {
      vpc: vpc,
      internetFacing: true,
    });

    const http_listener = lb.addListener("http_listener", {
      port: 80,
      open: true,
    });

    http_listener.addTargets("web_target", {
      port: 80,
      targets: [asg],
      deregistrationDelay: cdk.Duration.seconds(60),
    });

    asg.connections.allowFrom(lb, ec2.Port.tcp(80));

    new CfnOutput(this, "output_site_url", {
      value: lb.loadBalancerDnsName,
    });
  }
}

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import { Construct } from "constructs";

export class AsgStack extends cdk.Stack {
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
    userData.addCommands("yum update -y && yum install -y httpd");
    userData.addCommands(
      "curl http://169.254.169.254/latest/meta-data/public-ipv4 > /tmp/ip.txt"
    );
    userData.addCommands("cp /tmp/ip.txt /var/www/html/index.html");
    userData.addCommands("## Simulate booting time by sleep command");
    userData.addCommands("sleep 300");
    userData.addCommands("systemctl enable httpd");
    userData.addCommands("systemctl start httpd");

    const asg = new autoscaling.AutoScalingGroup(this, "asg", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      userData: userData,
      healthCheck: {
        type: "ELB",
        gracePeriod: cdk.Duration.seconds(60),
      },
    });

    const lb = new elbv2.ApplicationLoadBalancer(this, "lb", {
      vpc: vpc,
      internetFacing: true,
    });

    const httpListener = lb.addListener("httpListener", {
      port: 80,
      open: true,
    });

    httpListener.addTargets("webTarget", {
      port: 80,
      targets: [asg],
      deregistrationDelay: cdk.Duration.seconds(60),
    });

    asg.connections.allowFrom(lb, ec2.Port.tcp(80));

    new cdk.CfnOutput(this, "SiteURL", {
      value: lb.loadBalancerDnsName,
    });

    new cdk.CfnOutput(this, "AutoScalingGroupName", {
      value: asg.autoScalingGroupName,
    });

    new cdk.CfnOutput(this, "LoadBalancerName", {
      value: lb.loadBalancerName,
    });
  }
}

import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as elbv2 from "@aws-cdk/aws-elasticloadbalancingv2";
import * as route53 from "@aws-cdk/aws-route53";
import { CfnOutput } from "@aws-cdk/core";
import { InstanceTarget } from "@aws-cdk/aws-elasticloadbalancingv2-targets";
import { LoadBalancerTarget } from "@aws-cdk/aws-route53-targets";

export class ColorStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const domain_name = new cdk.CfnParameter(this, "domainName", {
      type: "String",
      description: "Hosted zone domain name.",
    });

    const hosted_zone_id = new cdk.CfnParameter(this, "hostedZoneId", {
      type: "String",
      description: "Hosted zone ID.",
    });

    const vpc = new ec2.Vpc(this, "vpc", {
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    const green_user_data = ec2.UserData.forLinux();
    green_user_data.addCommands("yum update -y && yum install -y httpd");
    green_user_data.addCommands(
      "echo '<style>body {background-color: green}</style>' > /tmp/index.html"
    );
    green_user_data.addCommands(
      "echo '<h1>Hi! I am green</h1>' >> /tmp/index.html"
    );
    green_user_data.addCommands("cp /tmp/index.html /var/www/html/");
    green_user_data.addCommands("mkdir /var/www/html/green && mv /tmp/index.html /var/www/html/green/");
    green_user_data.addCommands("systemctl enable httpd");
    green_user_data.addCommands("systemctl start httpd");

    const green_instance = new ec2.Instance(this, "green_instance", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      userData: green_user_data,
    });

    const blue_user_data = ec2.UserData.forLinux();
    blue_user_data.addCommands("yum update -y && yum install -y httpd");
    blue_user_data.addCommands(
      "echo '<style>body {background-color: blue}</style>' > /tmp/index.html"
    );
    blue_user_data.addCommands(
      "echo '<h1>Hi! I am blue</h1>' >> /tmp/index.html"
    );
    blue_user_data.addCommands("cp /tmp/index.html /var/www/html/");
    blue_user_data.addCommands("mkdir /var/www/html/blue && mv /tmp/index.html /var/www/html/blue/");
    blue_user_data.addCommands("systemctl enable httpd");
    blue_user_data.addCommands("systemctl start httpd");

    const blue_instance = new ec2.Instance(this, "blue_instance", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      userData: blue_user_data,
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
      targets: [
        new InstanceTarget(green_instance),
        new InstanceTarget(blue_instance),
      ],
      deregistrationDelay: cdk.Duration.seconds(0),
    });

    green_instance.connections.allowFrom(lb, ec2.Port.tcp(80));
    blue_instance.connections.allowFrom(lb, ec2.Port.tcp(80));

    const hosted_zone = route53.HostedZone.fromHostedZoneAttributes(
      this,
      "hosted_zone",
      {
        hostedZoneId: hosted_zone_id.valueAsString,
        zoneName: domain_name.valueAsString,
      }
    );

    const site_url = new route53.ARecord(this, "site_url", {
      zone: hosted_zone,
      target: route53.RecordTarget.fromAlias(new LoadBalancerTarget(lb)),
      recordName: "color",
    });

    new CfnOutput(this, "output_site_url", {
      value: site_url.domainName,
    });
  }
}

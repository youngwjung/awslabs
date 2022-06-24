import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as route53 from "aws-cdk-lib/aws-route53";
import { CfnOutput } from "aws-cdk-lib";
import { InstanceTarget } from "aws-cdk-lib/aws-elasticloadbalancingv2-targets";
import { LoadBalancerTarget } from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";

export class ColorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const domainName = new cdk.CfnParameter(this, "domainName", {
      type: "String",
      description: "Hosted zone domain name.",
    });

    const hostedZoneId = new cdk.CfnParameter(this, "hostedZoneId", {
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

    const greenUserData = ec2.UserData.forLinux();
    greenUserData.addCommands("yum update -y && yum install -y httpd");
    greenUserData.addCommands(
      "echo '<style>body {background-color: green}</style>' > /tmp/index.html"
    );
    greenUserData.addCommands(
      "echo '<h1>Hi! I am green</h1>' >> /tmp/index.html"
    );
    greenUserData.addCommands("cp /tmp/index.html /var/www/html/");
    greenUserData.addCommands(
      "mkdir /var/www/html/green && mv /tmp/index.html /var/www/html/green/"
    );
    greenUserData.addCommands("systemctl enable httpd");
    greenUserData.addCommands("systemctl start httpd");

    const greenInstance = new ec2.Instance(this, "greenInstance", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      userData: greenUserData,
    });

    const blueUserData = ec2.UserData.forLinux();
    blueUserData.addCommands("yum update -y && yum install -y httpd");
    blueUserData.addCommands(
      "echo '<style>body {background-color: blue}</style>' > /tmp/index.html"
    );
    blueUserData.addCommands(
      "echo '<h1>Hi! I am blue</h1>' >> /tmp/index.html"
    );
    blueUserData.addCommands("cp /tmp/index.html /var/www/html/");
    blueUserData.addCommands(
      "mkdir /var/www/html/blue && mv /tmp/index.html /var/www/html/blue/"
    );
    blueUserData.addCommands("systemctl enable httpd");
    blueUserData.addCommands("systemctl start httpd");

    const blueInstance = new ec2.Instance(this, "blueInstance", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      userData: blueUserData,
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
      targets: [
        new InstanceTarget(greenInstance),
        new InstanceTarget(blueInstance),
      ],
      deregistrationDelay: cdk.Duration.seconds(0),
    });

    greenInstance.connections.allowFrom(lb, ec2.Port.tcp(80));
    blueInstance.connections.allowFrom(lb, ec2.Port.tcp(80));

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(
      this,
      "hostedZone",
      {
        hostedZoneId: hostedZoneId.valueAsString,
        zoneName: domainName.valueAsString,
      }
    );

    const domainRecord = new route53.ARecord(this, "domainRecord", {
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(new LoadBalancerTarget(lb)),
      recordName: "color",
    });

    new CfnOutput(this, "siteUrl", {
      value: domainRecord.domainName,
    });
  }
}

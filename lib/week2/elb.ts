import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as route53 from "aws-cdk-lib/aws-route53";
import { CfnOutput } from "aws-cdk-lib";
import { InstanceTarget } from "aws-cdk-lib/aws-elasticloadbalancingv2-targets";
import { LoadBalancerTarget } from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";

export class ElbStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const keyPair = new cdk.CfnParameter(this, "keyPair", {
      type: "AWS::EC2::KeyPair::KeyName",
      description: "An Amazon EC2 key pair name.",
    });

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

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "yum update -y && yum install -y httpd git mod_wsgi python3-3.7*"
    );
    userData.addCommands("pip3 install flask");
    userData.addCommands(
      "git clone https://github.com/youngwjung/flask-ssl.git /var/www/html/"
    );
    userData.addCommands("mv /var/www/html/app.conf /etc/httpd/conf.d/");
    userData.addCommands("systemctl enable httpd");
    userData.addCommands("systemctl start httpd");

    const instance = new ec2.Instance(this, "instance", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      userData: userData,
      keyName: keyPair.valueAsString,
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
      targets: [new InstanceTarget(instance)],
    });

    instance.connections.allowFrom(lb, ec2.Port.tcp(80));

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
      recordName: "elb",
    });

    new CfnOutput(this, "siteUrl", {
      value: domainRecord.domainName,
    });
  }
}

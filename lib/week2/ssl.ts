import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as route53 from "aws-cdk-lib/aws-route53";
import { Construct } from "constructs";

export class SslStack extends cdk.Stack {
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
      "yum update -y && yum install -y httpd git python3-pip httpd-devel python3-devel"
    );
    userData.addCommands("pip3 install Flask==1.1.4 mod_wsgi");
    userData.addCommands(
      "mod_wsgi-express module-config > /etc/httpd/conf.d/wsgi.conf"
    );
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
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      userData: userData,
      keyName: keyPair.valueAsString,
    });
    instance.connections.allowFromAnyIpv4(ec2.Port.tcp(80));

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
      target: route53.RecordTarget.fromIpAddresses(instance.instancePublicIp),
      recordName: "ssl",
    });

    new cdk.CfnOutput(this, "SiteURL", {
      value: domainRecord.domainName,
    });

    new cdk.CfnOutput(this, "InstanceId", {
      value: instance.instanceId,
    });
  }
}

import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as route53 from "@aws-cdk/aws-route53";
import { CfnOutput } from "@aws-cdk/core";

export class SslStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const keypair = new cdk.CfnParameter(this, "keypair", {
      type: "AWS::EC2::KeyPair::KeyName",
      description: "An Amazon EC2 key pair name.",
    });

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

    const user_data = ec2.UserData.forLinux();
    user_data.addCommands(
      "yum update -y && yum install -y httpd git mod_wsgi python3-3.7*"
    );
    user_data.addCommands("pip3 install flask");
    user_data.addCommands(
      "git clone https://github.com/youngwjung/flask-ssl.git /var/www/html/"
    );
    user_data.addCommands("mv /var/www/html/app.conf /etc/httpd/conf.d/");
    user_data.addCommands("systemctl enable httpd");
    user_data.addCommands("systemctl start httpd");

    const instance = new ec2.Instance(this, "instance", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      userData: user_data,
      keyName: keypair.valueAsString,
    });
    instance.connections.allowFromAnyIpv4(ec2.Port.tcp(80));

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
      target: route53.RecordTarget.fromIpAddresses(instance.instancePublicIp),
      recordName: "ssl",
    });

    new CfnOutput(this, 'output_site_url', {
      value: site_url.domainName
    })
  }
}

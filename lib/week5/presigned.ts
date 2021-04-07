import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as iam from "@aws-cdk/aws-iam";
import * as route53 from "@aws-cdk/aws-route53";
import { Bucket } from "@aws-cdk/aws-s3";
import { CfnOutput } from "@aws-cdk/core";

export class PresignedStack extends cdk.Stack {
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

    const bucket = new Bucket(this, "bucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        actions: ["s3:PutObject"],
        principals: [new iam.AnyPrincipal()],
        resources: [bucket.bucketArn, `${bucket.bucketArn}/*`],
        conditions: {
          NotIpAddress: {
            "aws:SourceIp": "123.123.123.123/32",
          },
        },
      })
    );

    const user_data = ec2.UserData.forLinux();
    user_data.addCommands("amazon-linux-extras install -y nginx1");
    user_data.addCommands("yum install -y git python3-3.7*");
    user_data.addCommands(
      "cd /home/ec2-user/ && git clone https://github.com/youngwjung/s3-presigned-url.git"
    );
    user_data.addCommands(
      "pip3 install -r /home/ec2-user/s3-presigned-url/requirements.txt"
    );
    user_data.addCommands(
      `sed -i 's/BUCKET_NAME/"${bucket.bucketName}"/g' /home/ec2-user/s3-presigned-url/main.py`
    );
    user_data.addCommands(
      `sed -i 's/BACKEND/presigned.${domain_name.valueAsString}/g' /home/ec2-user/s3-presigned-url/html/main.js`
    );
    user_data.addCommands(
      "\\cp -r /home/ec2-user/s3-presigned-url/html/ /usr/share/nginx/"
    );
    user_data.addCommands("systemctl enable nginx");
    user_data.addCommands("systemctl start nginx");

    const app = new ec2.Instance(this, "app", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      userData: user_data,
    });

    app.connections.allowFromAnyIpv4(ec2.Port.tcp(80));
    app.connections.allowFromAnyIpv4(ec2.Port.tcp(5000));

    app.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonEC2RoleforSSM"
      )
    );

    const eip = new ec2.CfnEIP(this, "eip", {
      instanceId: app.instanceId,
    });

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
      target: route53.RecordTarget.fromIpAddresses(eip.ref),
      recordName: "presigned",
      ttl: cdk.Duration.seconds(60),
    });

    new CfnOutput(this, "output_site_url", {
      value: site_url.domainName,
    });
  }
}

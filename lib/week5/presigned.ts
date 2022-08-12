import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as route53 from "aws-cdk-lib/aws-route53";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export class PresignedStack extends cdk.Stack {
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

    const bucket = new Bucket(this, "bucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
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

    const userData = ec2.UserData.forLinux();
    userData.addCommands("amazon-linux-extras install -y nginx1");
    userData.addCommands("yum install -y git python3-3.7*");
    userData.addCommands(
      "cd /home/ec2-user/ && git clone https://github.com/youngwjung/s3-presigned-url.git"
    );
    userData.addCommands(
      "pip3 install -r /home/ec2-user/s3-presigned-url/requirements.txt"
    );
    userData.addCommands(
      `sed -i 's/BUCKET_NAME/"${bucket.bucketName}"/g' /home/ec2-user/s3-presigned-url/main.py`
    );
    userData.addCommands(
      `sed -i 's/BACKEND/presigned.${domainName.valueAsString}/g' /home/ec2-user/s3-presigned-url/html/main.js`
    );
    userData.addCommands(
      "\\cp -r /home/ec2-user/s3-presigned-url/html/ /usr/share/nginx/"
    );
    userData.addCommands("systemctl enable nginx");
    userData.addCommands("systemctl start nginx");

    const app = new ec2.Instance(this, "app", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      userData: userData,
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
      target: route53.RecordTarget.fromIpAddresses(eip.ref),
      recordName: "presigned",
      ttl: cdk.Duration.seconds(60),
    });

    new cdk.CfnOutput(this, "SiteURL", {
      value: domainRecord.domainName,
    });

    new cdk.CfnOutput(this, "InstanceId", {
      value: app.instanceId,
    });
  }
}

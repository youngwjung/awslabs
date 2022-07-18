import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cr from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";

export class GuarddutyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const victimVpc = new ec2.Vpc(this, "victimVpc", {
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    const zombieVpc = new ec2.Vpc(this, "zombieVpc", {
      natGateways: 0,
      cidr: "192.168.0.0/16",
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    const bucket = new s3.Bucket(this, "bucket", {
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        blockPublicPolicy: false,
      }),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    bucket.grantPublicAccess();

    const victimUserData = ec2.UserData.forLinux();
    victimUserData.addCommands(
      "cat <<EOF >> /home/ec2-user/bitcoin.sh",
      "#!/bin/bash",
      "",
      "while true;",
      "do",
      "curl -s http://pool.minergate.com/dkjdjkjdlsajdkljalsskajdksakjdksajkllalkdjsalkjdsalkjdlkasj  > /dev/null &",
      "curl -s http://xmr.pool.minergate.com/dhdhjkhdjkhdjkhajkhdjskahhjkhjkahdsjkakjasdhkjahdjk  > /dev/null &",
      "sleep 60",
      "done",
      "EOF"
    );
    victimUserData.addCommands("nohup bash /home/ec2-user/bitcoin.sh &");

    const victimInstance = new ec2.Instance(this, "victimInstance", {
      vpc: victimVpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      userData: victimUserData,
      userDataCausesReplacement: true,
    });

    victimInstance.connections.allowFromAnyIpv4(
      ec2.Port.allTcp(),
      "Open TCP to the world"
    );
    victimInstance.connections.allowFromAnyIpv4(
      ec2.Port.allIcmp(),
      "Open ICMP to the world"
    );

    victimInstance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess")
    );

    const zombieUserData = ec2.UserData.forLinux();
    zombieUserData.addCommands("yum install -y nmap jq");
    zombieUserData.addCommands(
      "cat <<EOF >> /home/ec2-user/ping.sh",
      "#!/bin/bash",
      "",
      `ping -c 10 ${victimInstance.instancePublicDnsName}`,
      "EOF"
    );
    zombieUserData.addCommands("nohup bash /home/ec2-user/ping.sh &");
    zombieUserData.addCommands(
      "curl http://169.254.169.254/latest/meta-data/public-ipv4 > /tmp/ip.txt"
    );
    zombieUserData.addCommands(
      `aws s3 cp /tmp/ip.txt s3://${bucket.bucketName}/`
    );
    zombieUserData.addCommands(
      `aws guardduty create-threat-intel-set --detector-id $(aws guardduty list-detectors --region $(curl http://169.254.169.254/latest/meta-data/placement/region) | jq -r .DetectorIds[0]) --name attackers --format TXT --location s3://${bucket.bucketName}/ip.txt --activate --region $(curl http://169.254.169.254/latest/meta-data/placement/region)`
    );

    const zombieInstance = new ec2.Instance(this, "zombieInstance", {
      vpc: zombieVpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      userData: zombieUserData,
      userDataCausesReplacement: true,
    });

    zombieInstance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonEC2RoleforSSM"
      )
    );
    zombieInstance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonGuardDutyFullAccess")
    );
    zombieInstance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("IAMFullAccess")
    );

    const delayGenerator = new lambda.Function(this, "delayGenerator", {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset("lambda/wait"),
      handler: "app.on_event",
      timeout: cdk.Duration.minutes(15),
    });

    const delayProvider = new cr.Provider(this, "delayProvider", {
      onEventHandler: delayGenerator,
    });

    const delay = new cdk.CustomResource(this, "delay", {
      serviceToken: delayProvider.serviceToken,
      properties: {
        time: 600,
      },
    });

    delay.node.addDependency(zombieInstance);
  }
}

import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as iam from "@aws-cdk/aws-iam";
import * as s3 from "@aws-cdk/aws-s3";

export class GuarddutyStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const victim_vpc = new ec2.Vpc(this, "victim_vpc", {
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    const zombie_vpc = new ec2.Vpc(this, "zombie_vpc", {
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
    });
    bucket.grantPublicAccess();

    const victim_user_data = ec2.UserData.forLinux();
    victim_user_data.addCommands(
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
    victim_user_data.addCommands("nohup bash /home/ec2-user/bitcoin.sh &");

    const victim_instance = new ec2.Instance(this, "victim_instance", {
      vpc: victim_vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      userData: victim_user_data,
      userDataCausesReplacement: true,
    });

    victim_instance.connections.allowFromAnyIpv4(
      ec2.Port.allTcp(),
      "Open TCP to the world"
    );
    victim_instance.connections.allowFromAnyIpv4(
      ec2.Port.allIcmp(),
      "Open ICMP to the world"
    );

    victim_instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess")
    );

    const zombie_user_data = ec2.UserData.forLinux();
    zombie_user_data.addCommands("yum install -y nmap jq");
    zombie_user_data.addCommands(
      "cat <<EOF >> /home/ec2-user/ping.sh",
      "#!/bin/bash",
      "",
      `ping -c 10 ${victim_instance.instancePublicDnsName}`,
      "EOF"
    );
    zombie_user_data.addCommands("nohup bash /home/ec2-user/ping.sh &");
    zombie_user_data.addCommands(
      "curl http://169.254.169.254/latest/meta-data/public-ipv4 > /tmp/ip.txt"
    );
    zombie_user_data.addCommands(
      `aws s3 cp /tmp/ip.txt s3://${bucket.bucketName}/`
    );
    zombie_user_data.addCommands(
      `aws guardduty create-threat-intel-set --detector-id $(aws guardduty list-detectors --region $(curl http://169.254.169.254/latest/meta-data/placement/region) | jq -r .DetectorIds[0]) --name attackers --format TXT --location s3://${bucket.bucketName}/ip.txt --activate --region $(curl http://169.254.169.254/latest/meta-data/placement/region)`
    );

    const zombie_instance = new ec2.Instance(this, "zombie_instance", {
      vpc: zombie_vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      userData: zombie_user_data,
      userDataCausesReplacement: true,
    });

    zombie_instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonEC2RoleforSSM"
      )
    );
    zombie_instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonGuardDutyFullAccess")
    );
    zombie_instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("IAMFullAccess")
    );
  }
}

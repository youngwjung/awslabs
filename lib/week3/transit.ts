import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";

export class TransitStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const keypair = new cdk.CfnParameter(this, "keypair", {
      type: "AWS::EC2::KeyPair::KeyName",
      description: "An Amazon EC2 key pair name.",
    });

    // VPC
    const vpc_a = new ec2.Vpc(this, "vpc_a", {
      cidr: "10.0.0.0/16",
      maxAzs: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
      natGateways: 0,
    });

    const vpc_b = new ec2.Vpc(this, "vpc_b", {
      cidr: "172.16.0.0/16",
      maxAzs: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "private",
          subnetType: ec2.SubnetType.ISOLATED,
        },
      ],
      natGateways: 0,
    });

    const vpc_c = new ec2.Vpc(this, "vpc_c", {
      cidr: "10.0.0.0/16",
      maxAzs: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "private",
          subnetType: ec2.SubnetType.ISOLATED,
        },
      ],
      natGateways: 0,
    });

    const instance_a = new ec2.Instance(this, "instance_a", {
      vpc: vpc_a,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      keyName: keypair.valueAsString,
      instanceName: "A",
      vpcSubnets: {
        subnets: [vpc_a.publicSubnets[0]],
      },
    });

    const instance_b = new ec2.Instance(this, "instance_b", {
      vpc: vpc_b,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      keyName: keypair.valueAsString,
      instanceName: "B",
      vpcSubnets: {
        subnets: [vpc_b.isolatedSubnets[0]],
      },
    });

    const instance_c = new ec2.Instance(this, "instance_c", {
      vpc: vpc_c,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      keyName: keypair.valueAsString,
      instanceName: "C",
      vpcSubnets: {
        subnets: [vpc_c.isolatedSubnets[0]],
      },
    });
  }
}

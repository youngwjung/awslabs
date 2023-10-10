import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export class TransitStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC
    const vpcA = new ec2.Vpc(this, "vpcA", {
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
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

    const vpcB = new ec2.Vpc(this, "vpcB", {
      ipAddresses: ec2.IpAddresses.cidr("10.1.0.0/16"),
      maxAzs: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "private",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
      natGateways: 0,
    });

    const vpcC = new ec2.Vpc(this, "vpcC", {
      ipAddresses: ec2.IpAddresses.cidr("10.2.0.0/16"),
      maxAzs: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "private",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
      natGateways: 0,
    });

    const instanceA = new ec2.Instance(this, "instanceA", {
      vpc: vpcA,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      instanceName: "A",
      vpcSubnets: {
        subnets: [vpcA.publicSubnets[0]],
      },
    });

    instanceA.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonEC2RoleforSSM"
      )
    );

    const instanceB = new ec2.Instance(this, "instanceB", {
      vpc: vpcB,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      instanceName: "B",
      vpcSubnets: {
        subnets: [vpcB.isolatedSubnets[0]],
      },
    });

    const instanceC = new ec2.Instance(this, "instanceC", {
      vpc: vpcC,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      instanceName: "C",
      vpcSubnets: {
        subnets: [vpcC.isolatedSubnets[0]],
      },
    });

    new cdk.CfnOutput(this, "InstanceAId", {
      value: instanceA.instanceId,
    });

    new cdk.CfnOutput(this, "InstanceBId", {
      value: instanceB.instanceId,
    });

    new cdk.CfnOutput(this, "InstanceCId", {
      value: instanceC.instanceId,
    });

    new cdk.CfnOutput(this, "VpcAId", {
      value: vpcA.vpcId,
    });

    new cdk.CfnOutput(this, "VpcBId", {
      value: vpcB.vpcId,
    });

    new cdk.CfnOutput(this, "VpcCId", {
      value: vpcC.vpcId,
    });
  }
}

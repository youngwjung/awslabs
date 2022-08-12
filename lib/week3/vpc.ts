import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as targets from "aws-cdk-lib/aws-elasticloadbalancingv2-targets";
import { Construct } from "constructs";

export class VpcStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const keyPair = new cdk.CfnParameter(this, "keyPair", {
      type: "AWS::EC2::KeyPair::KeyName",
      description: "An Amazon EC2 key pair name.",
    });

    // VPC
    const vpc = new ec2.Vpc(this, "vpc", {
      cidr: "10.0.0.0/16",
      subnetConfiguration: [],
      natGateways: 0,
    });

    // Public subnets with IGW
    const publicSubnet1 = new ec2.Subnet(this, "publicSubnet1", {
      availabilityZone: vpc.availabilityZones[0],
      cidrBlock: "10.0.0.0/24",
      vpcId: vpc.vpcId,
      mapPublicIpOnLaunch: true,
    });

    const publicSubnet2 = new ec2.Subnet(this, "publicSubnet2", {
      availabilityZone: vpc.availabilityZones[1],
      cidrBlock: "10.0.1.0/24",
      vpcId: vpc.vpcId,
    });

    // Private subnets with NAT
    const privateSubnet1 = new ec2.Subnet(this, "privateSubnet1", {
      availabilityZone: vpc.availabilityZones[0],
      cidrBlock: "10.0.10.0/24",
      vpcId: vpc.vpcId,
    });

    const privateSubnet2 = new ec2.Subnet(this, "privateSubnet2", {
      availabilityZone: vpc.availabilityZones[1],
      cidrBlock: "10.0.11.0/24",
      vpcId: vpc.vpcId,
    });

    // Isolated subnets
    const isolatedSubnet1 = new ec2.Subnet(this, "isolatedSubnet1", {
      availabilityZone: vpc.availabilityZones[0],
      cidrBlock: "10.0.20.0/24",
      vpcId: vpc.vpcId,
    });

    const isolatedSubnet2 = new ec2.Subnet(this, "isolatedSubnet2", {
      availabilityZone: vpc.availabilityZones[1],
      cidrBlock: "10.0.21.0/24",
      vpcId: vpc.vpcId,
    });

    // Custom Gateways

    const igw = new ec2.CfnInternetGateway(this, "igw");

    const igwAttachment = new ec2.CfnVPCGatewayAttachment(
      this,
      "igwAttachment",
      {
        vpcId: vpc.vpcId,
        internetGatewayId: igw.ref,
      }
    );

    const eipNat = new ec2.CfnEIP(this, "eipNat");

    const nat = new ec2.CfnNatGateway(this, "nat", {
      allocationId: eipNat.attrAllocationId,
      subnetId: publicSubnet1.subnetId,
    });

    // Routes
    const routeIgw = new ec2.CfnRoute(this, "routeIgw", {
      routeTableId: publicSubnet1.routeTable.routeTableId,
      destinationCidrBlock: "10.1.0.0/16",
      gatewayId: igw.ref,
    });

    const routeNat = new ec2.CfnRoute(this, "routeNat", {
      routeTableId: privateSubnet1.routeTable.routeTableId,
      destinationCidrBlock: "10.1.0.0/16",
      natGatewayId: nat.ref,
    });

    // NACL
    const naclPublic = new ec2.NetworkAcl(this, "naclPublic", {
      vpc: vpc,
    });

    const naclPrivate = new ec2.NetworkAcl(this, "naclPrivate", {
      vpc: vpc,
    });

    const naclIsolated = new ec2.NetworkAcl(this, "naclIsolated", {
      vpc: vpc,
    });

    const naclEntryPublic = new ec2.NetworkAclEntry(this, "naclEntryPublic", {
      cidr: ec2.AclCidr.ipv4("172.16.0.0/24"),
      networkAcl: naclPublic,
      ruleNumber: 100,
      traffic: ec2.AclTraffic.icmp({
        code: -1,
        type: -1,
      }),
      ruleAction: ec2.Action.ALLOW,
      direction: ec2.TrafficDirection.EGRESS,
    });

    const naclEntryPrivate1 = new ec2.NetworkAclEntry(
      this,
      "naclEntryPrivate1",
      {
        cidr: ec2.AclCidr.anyIpv4(),
        networkAcl: naclPrivate,
        ruleNumber: 100,
        traffic: ec2.AclTraffic.icmp({
          code: -1,
          type: -1,
        }),
        ruleAction: ec2.Action.DENY,
        direction: ec2.TrafficDirection.INGRESS,
      }
    );

    const naclEntryPrivate2 = new ec2.NetworkAclEntry(
      this,
      "naclEntryPrivate2",
      {
        cidr: ec2.AclCidr.anyIpv4(),
        networkAcl: naclPrivate,
        ruleNumber: 200,
        traffic: ec2.AclTraffic.icmp({
          code: -1,
          type: -1,
        }),
        ruleAction: ec2.Action.ALLOW,
        direction: ec2.TrafficDirection.INGRESS,
      }
    );

    publicSubnet1.associateNetworkAcl(
      "publicSubnet1NaclAssociation",
      naclPublic
    );

    privateSubnet1.associateNetworkAcl(
      "privateSubnet1NaclAssociation",
      naclPrivate
    );

    const bastionHostSg = new ec2.SecurityGroup(this, "bastionHostSg", {
      vpc: vpc,
      allowAllOutbound: false,
    });

    bastionHostSg.addIngressRule(
      ec2.Peer.ipv4("192.168.1.1/32"),
      ec2.Port.tcp(22)
    );

    const bastionHost = new ec2.Instance(this, "bastionHost", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      keyName: keyPair.valueAsString,
      vpcSubnets: {
        subnets: [publicSubnet1],
      },
      securityGroup: bastionHostSg,
    });

    const webServer = new ec2.Instance(this, "webServer", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.genericLinux({
        "ap-northeast-2": "ami-0cb7146396a8ab3d7",
      }),
      keyName: keyPair.valueAsString,
      vpcSubnets: {
        subnets: [privateSubnet1],
      },
    });

    webServer.connections.allowFrom(bastionHostSg, ec2.Port.tcp(22));

    const lb = new elbv2.ApplicationLoadBalancer(this, "lb", {
      vpc: vpc,
      internetFacing: true,
      vpcSubnets: {
        subnets: [publicSubnet1, publicSubnet2],
      },
    });

    const httpListener = lb.addListener("httpListener", {
      port: 80,
      open: true,
    });

    httpListener.addTargets("webTarget", {
      port: 80,
      targets: [new targets.InstanceTarget(webServer)],
      deregistrationDelay: cdk.Duration.seconds(60),
    });

    webServer.connections.allowFrom(lb, ec2.Port.tcp(8080));

    new cdk.CfnOutput(this, "SiteURL", {
      value: lb.loadBalancerDnsName,
    });

    new cdk.CfnOutput(this, "InstanceId", {
      value: webServer.instanceId,
    });

    new cdk.CfnOutput(this, "VPCId", {
      value: vpc.vpcId,
    });

    new cdk.CfnOutput(this, "LoadBalancerName", {
      value: lb.loadBalancerName,
    });
  }
}

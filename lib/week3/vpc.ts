import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as elbv2 from "@aws-cdk/aws-elasticloadbalancingv2";
import * as targets from "@aws-cdk/aws-elasticloadbalancingv2-targets";
import { CfnOutput } from "@aws-cdk/core";
import { SubnetNetworkAclAssociation } from "@aws-cdk/aws-ec2";

export class VpcStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const keypair = new cdk.CfnParameter(this, "keypair", {
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
    const public_subnet_1 = new ec2.Subnet(this, "public_subnet_1", {
      availabilityZone: vpc.availabilityZones[0],
      cidrBlock: "10.0.0.0/24",
      vpcId: vpc.vpcId,
      mapPublicIpOnLaunch: true,
    });

    const public_subnet_2 = new ec2.Subnet(this, "public_subnet_2", {
      availabilityZone: vpc.availabilityZones[1],
      cidrBlock: "10.0.1.0/24",
      vpcId: vpc.vpcId,
    });

    // Private subnets with NAT
    const private_subnet_1 = new ec2.Subnet(this, "private_subnet_1", {
      availabilityZone: vpc.availabilityZones[0],
      cidrBlock: "10.0.10.0/24",
      vpcId: vpc.vpcId,
    });

    const private_subnet_2 = new ec2.Subnet(this, "private_subnet_2", {
      availabilityZone: vpc.availabilityZones[1],
      cidrBlock: "10.0.11.0/24",
      vpcId: vpc.vpcId,
    });

    // Isolated subnets
    const isolated_subnet_1 = new ec2.Subnet(this, "isolated_subnet_1", {
      availabilityZone: vpc.availabilityZones[0],
      cidrBlock: "10.0.20.0/24",
      vpcId: vpc.vpcId,
    });

    const isolated_subnet_2 = new ec2.Subnet(this, "isolated_subnet_2", {
      availabilityZone: vpc.availabilityZones[1],
      cidrBlock: "10.0.21.0/24",
      vpcId: vpc.vpcId,
    });

    // Custom Gateways

    const igw = new ec2.CfnInternetGateway(this, "igw");

    const igw_attachment = new ec2.CfnVPCGatewayAttachment(
      this,
      "igw_attachment",
      {
        vpcId: vpc.vpcId,
        internetGatewayId: igw.ref,
      }
    );

    const eip_nat = new ec2.CfnEIP(this, "eip_nat");

    const nat = new ec2.CfnNatGateway(this, "nat", {
      allocationId: eip_nat.attrAllocationId,
      subnetId: public_subnet_1.subnetId,
    });

    // // Route Tables
    // const rtb_public = new ec2.CfnRouteTable(this, "rtb_public", {
    //   vpcId: vpc.vpcId,
    // });

    // const rtb_private = new ec2.CfnRouteTable(this, "rtb_private", {
    //   vpcId: vpc.vpcId,
    // });

    // const rtb_isolated = new ec2.CfnRouteTable(this, "rtb_isolated", {
    //   vpcId: vpc.vpcId,
    // });

    // Routes
    const route_igw = new ec2.CfnRoute(this, "route_igw", {
      routeTableId: public_subnet_1.routeTable.routeTableId,
      destinationCidrBlock: "10.1.0.0/16",
      gatewayId: igw.ref,
    });

    const route_nat = new ec2.CfnRoute(this, "route_nat", {
      routeTableId: private_subnet_1.routeTable.routeTableId,
      destinationCidrBlock: "10.1.0.0/16",
      natGatewayId: nat.ref,
    });

    // NACL
    const nacl_public = new ec2.NetworkAcl(this, "nacl_public", {
      vpc: vpc,
    });

    const nacl_private = new ec2.NetworkAcl(this, "nacl_private", {
      vpc: vpc,
    });

    const nacl_isolated = new ec2.NetworkAcl(this, "nacl_isolated", {
      vpc: vpc,
    });

    const nacl_entry_public = new ec2.NetworkAclEntry(
      this,
      "nacl_entry_public",
      {
        cidr: ec2.AclCidr.ipv4("172.16.0.0/24"),
        networkAcl: nacl_public,
        ruleNumber: 100,
        traffic: ec2.AclTraffic.icmp({
          code: -1,
          type: -1,
        }),
        ruleAction: ec2.Action.ALLOW,
        direction: ec2.TrafficDirection.EGRESS,
      }
    );

    const nacl_entry_private_1 = new ec2.NetworkAclEntry(
      this,
      "nacl_entry_private",
      {
        cidr: ec2.AclCidr.anyIpv4(),
        networkAcl: nacl_private,
        ruleNumber: 100,
        traffic: ec2.AclTraffic.icmp({
          code: -1,
          type: -1,
        }),
        ruleAction: ec2.Action.DENY,
        direction: ec2.TrafficDirection.INGRESS,
      }
    );

    const nacl_entry_private_2 = new ec2.NetworkAclEntry(
      this,
      "nacl_entry_private_2",
      {
        cidr: ec2.AclCidr.anyIpv4(),
        networkAcl: nacl_private,
        ruleNumber: 200,
        traffic: ec2.AclTraffic.icmp({
          code: -1,
          type: -1,
        }),
        ruleAction: ec2.Action.ALLOW,
        direction: ec2.TrafficDirection.INGRESS,
      }
    );

    public_subnet_1.associateNetworkAcl(
      "public_subnet_1_nacl_association",
      nacl_public
    );

    private_subnet_1.associateNetworkAcl(
      "private_subnet_1_nacl_association",
      nacl_private
    );

    const bastion_host_sg = new ec2.SecurityGroup(this, "bastion_host_sg", {
      vpc: vpc,
      allowAllOutbound: false,
    });

    bastion_host_sg.addIngressRule(
      ec2.Peer.ipv4("192.168.1.1/32"),
      ec2.Port.tcp(22)
    );

    const bastion_host = new ec2.Instance(this, "bastion_host", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      keyName: keypair.valueAsString,
      vpcSubnets: {
        subnets: [public_subnet_1],
      },
      securityGroup: bastion_host_sg,
    });

    const user_data = ec2.UserData.forLinux();
    user_data.addCommands("yum update -y && yum install -y httpd");
    user_data.addCommands(
      "curl http://169.254.169.254/latest/meta-data/public-ipv4 > /tmp/ip.txt"
    );
    user_data.addCommands("cp /tmp/ip.txt /var/www/html/index.html");
    user_data.addCommands("systemctl enable httpd");
    user_data.addCommands("systemctl start httpd");

    const web_server = new ec2.Instance(this, "web_server", {
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
      vpcSubnets: {
        subnets: [private_subnet_1],
      },
    });

    web_server.connections.allowFrom(bastion_host_sg, ec2.Port.tcp(22));

    const lb = new elbv2.ApplicationLoadBalancer(this, "lb", {
      vpc: vpc,
      internetFacing: true,
      vpcSubnets: {
        subnets: [public_subnet_1, public_subnet_2],
      },
    });

    const http_listener = lb.addListener("http_listener", {
      port: 80,
      open: true,
    });

    http_listener.addTargets("web_target", {
      port: 80,
      targets: [new targets.InstanceTarget(web_server)],
      deregistrationDelay: cdk.Duration.seconds(60),
    });

    web_server.connections.allowFrom(lb, ec2.Port.tcp(8080));

    new CfnOutput(this, "output_site_url", {
      value: lb.loadBalancerDnsName,
    });
  }
}

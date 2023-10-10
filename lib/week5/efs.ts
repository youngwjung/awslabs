import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import { InstanceTarget } from "aws-cdk-lib/aws-elasticloadbalancingv2-targets";
import { Construct } from "constructs";

export class EfsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

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
    userData.addCommands("yum update -y && yum install -y httpd");
    userData.addCommands(
      `echo "<h1>Hi from $(aws ec2 describe-instances --instance-ids $(curl http://169.254.169.254/latest/meta-data/instance-id) --region $(curl http://169.254.169.254/latest/meta-data/placement/region) --query "Reservations[*].Instances[*].Tags[?Key=='Name'].Value" --out text)</h1>" > /tmp/index.html`
    );
    userData.addCommands("cp /tmp/index.html /var/www/html/");
    userData.addCommands("systemctl enable httpd");
    userData.addCommands("systemctl start httpd");

    const instanceA = new ec2.Instance(this, "instanceA", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      instanceName: "A",
      userData: userData,
    });

    instanceA.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonEC2RoleforSSM"
      )
    );

    instanceA.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ReadOnlyAccess")
    );

    const instanceB = new ec2.Instance(this, "instanceB", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      instanceName: "B",
      userData: userData,
    });

    instanceB.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonEC2RoleforSSM"
      )
    );

    instanceB.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ReadOnlyAccess")
    );

    const lb = new elbv2.ApplicationLoadBalancer(this, "lb", {
      vpc: vpc,
      internetFacing: true,
    });

    const httpListener = lb.addListener("httpListener", {
      port: 80,
      open: true,
    });

    httpListener.addTargets("webTarget", {
      port: 80,
      targets: [new InstanceTarget(instanceA), new InstanceTarget(instanceB)],
      deregistrationDelay: cdk.Duration.seconds(0),
    });

    instanceA.connections.allowFrom(lb, ec2.Port.tcp(80));
    instanceB.connections.allowFrom(lb, ec2.Port.tcp(80));

    new cdk.CfnOutput(this, "SiteURL", {
      value: lb.loadBalancerDnsName,
    });

    new cdk.CfnOutput(this, "InstanceAId", {
      value: instanceA.instanceId,
    });

    new cdk.CfnOutput(this, "InstanceBId", {
      value: instanceB.instanceId,
    });

    new cdk.CfnOutput(this, "VpcId", {
      value: vpc.vpcId,
    });
  }
}

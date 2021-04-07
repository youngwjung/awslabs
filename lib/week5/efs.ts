import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as elbv2 from "@aws-cdk/aws-elasticloadbalancingv2";
import * as iam from "@aws-cdk/aws-iam";
import { CfnOutput } from "@aws-cdk/core";
import { InstanceTarget } from "@aws-cdk/aws-elasticloadbalancingv2-targets";

export class EfsStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
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

    const user_data = ec2.UserData.forLinux();
    user_data.addCommands("yum update -y && yum install -y httpd");
    user_data.addCommands(
      `echo "<h1>Hi from $(aws ec2 describe-instances --instance-ids $(curl http://169.254.169.254/latest/meta-data/instance-id) --region $(curl http://169.254.169.254/latest/meta-data/placement/region) --query "Reservations[*].Instances[*].Tags[?Key=='Name'].Value" --out text)</h1>" > /tmp/index.html`
    );
    user_data.addCommands("cp /tmp/index.html /var/www/html/");
    user_data.addCommands("systemctl enable httpd");
    user_data.addCommands("systemctl start httpd");

    const instance_a = new ec2.Instance(this, "instance_a", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      instanceName: "A",
      userData: user_data,
    });

    instance_a.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonEC2RoleforSSM"
      )
    );

    instance_a.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ReadOnlyAccess")
    );

    const instance_b = new ec2.Instance(this, "instance_b", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      instanceName: "B",
      userData: user_data,
    });

    instance_b.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonEC2RoleforSSM"
      )
    );

    instance_b.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ReadOnlyAccess")
    );

    const lb = new elbv2.ApplicationLoadBalancer(this, "lb", {
      vpc: vpc,
      internetFacing: true,
    });

    const http_listener = lb.addListener("http_listener", {
      port: 80,
      open: true,
    });

    http_listener.addTargets("web_target", {
      port: 80,
      targets: [new InstanceTarget(instance_a), new InstanceTarget(instance_b)],
      deregistrationDelay: cdk.Duration.seconds(0),
    });

    instance_a.connections.allowFrom(lb, ec2.Port.tcp(80));
    instance_b.connections.allowFrom(lb, ec2.Port.tcp(80));

    new CfnOutput(this, "output_site_url", {
      value: lb.loadBalancerDnsName,
    });
  }
}

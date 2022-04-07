import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Construct } from "constructs";

export class CodeDeployStack extends cdk.Stack {
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

    const devInstance = new ec2.Instance(this, "devInstance", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      instanceName: "locallibrary-dev",
    });

    devInstance.connections.allowFromAnyIpv4(ec2.Port.tcp(80));

    devInstance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonEC2RoleforSSM"
      )
    );

    const devDatabase = new rds.DatabaseInstance(this, "devDatabase", {
      instanceIdentifier: "locallibrary-dev",
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_12,
      }),
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      allocatedStorage: 20,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
    });

    devDatabase.connections.allowDefaultPortFrom(devInstance);

    const prodDatabase = new rds.DatabaseInstance(this, "prodDatabase", {
      instanceIdentifier: "locallibrary-prod",
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_12,
      }),
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      allocatedStorage: 20,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
    });

    devDatabase.connections.allowDefaultPortFrom(devInstance);

    const user_data = ec2.UserData.forLinux();
    user_data.addCommands(
      `
      yum install -y httpd httpd-devel postgresql python3 python3-devel gcc
      cd /opt && python3 -m venv venv
      source /opt/venv/bin/activate && pip install mod_wsgi
      systemctl enable httpd
      systemctl start httpd
      yum install -y ruby wget
      wget https://aws-codedeploy-ap-northeast-2.s3.ap-northeast-2.amazonaws.com/latest/install
      chmod +x ./install
      ./install auto
      systemctl enable codedeploy-agent
      systemctl start codedeploy-agent
      `
    );
    // user_data.addCommands(
    //   "sudo yum install -y httpd httpd-devel postgresql python3 python3-devel gcc",
    //   "cd /opt && python3 -m venv venv",
    //   "source /opt/venv/bin/activate && pip install mod_wsgi",
    //   "sudo systemctl enable httpd",
    //   "sudo systemctl start httpd",
    //   "sudo yum install -y ruby wget",
    //   "wget https://aws-codedeploy-ap-northeast-2.s3.ap-northeast-2.amazonaws.com/latest/install",
    //   "chmod +x ./install",
    //   "sudo ./install auto",
    //   "sudo systemctl enable codedeploy-agent",
    //   "sudo systemctl start codedeploy-agent",
    // )
    // user_data.addCommands("yum update -y && yum install -y httpd httpd-devel postgresql python3 python3-devel gcc ruby wget");
    // user_data.addCommands("cd /opt && python3 -m venv venv");
    // user_data.addCommands("source /opt/venv/bin/activate && pip install mod_wsgi");
    // user_data.addCommands("systemctl enable httpd");
    // user_data.addCommands("systemctl start httpd");
    // user_data.addCommands("wget https://aws-codedeploy-ap-northeast-2.s3.ap-northeast-2.amazonaws.com/latest/install");
    // user_data.addCommands("chmod +x ./install");
    // user_data.addCommands("./install auto");
    // user_data.addCommands("systemctl enable codedeploy-agent");
    // user_data.addCommands("systemctl start codedeploy-agent");

    const asg = new autoscaling.AutoScalingGroup(this, "locallibrary-prod", {
      autoScalingGroupName: "locallibrary-prod",
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      minCapacity: 1,
      maxCapacity: 3,
      userData: user_data,
    });

    asg.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonEC2RoleforSSM"
      )
    );

    const lb = new elbv2.ApplicationLoadBalancer(this, "lb", {
      vpc: vpc,
      internetFacing: true,
      loadBalancerName: "locallibrary-prod",
    });

    const tg = new elbv2.ApplicationTargetGroup(this, "tg", {
      targetGroupName: "locallibrary-prod",
      targetType: elbv2.TargetType.INSTANCE,
      targets: [asg],
      port: 80,
      vpc,
      deregistrationDelay: cdk.Duration.seconds(10),
      healthCheck: {
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 2,
        interval: cdk.Duration.seconds(5),
        timeout: cdk.Duration.seconds(2),
        path: "/catalog/",
      },
    });

    const httpListener = lb.addListener("httpListener", {
      port: 80,
      open: true,
    });

    httpListener.addTargetGroups("webTarget", {
      targetGroups: [tg],
    });

    asg.connections.allowFrom(lb, ec2.Port.tcp(80));
    prodDatabase.connections.allowDefaultPortFrom(asg);

    const codeDeplyoRole = new iam.Role(this, "codeDeplyoRole", {
      roleName: "CodeDeployLabRole",
      assumedBy: new iam.ServicePrincipal("codedeploy.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSCodeDeployRole"
        ),
      ],
    });

    new cdk.CfnOutput(this, "loadBalancerDnsName", {
      value: lb.loadBalancerDnsName,
    });
  }
}

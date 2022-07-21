import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import { CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";

export class VPCEndpointStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "vpc", {
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "isolated",
          subnetType: ec2.SubnetType.ISOLATED,
        },
      ],
    });

    const ssmVpcEndpoint = vpc.addInterfaceEndpoint("ssmVpcEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.SSM,
    });

    vpc.addInterfaceEndpoint("ssmmessagesVpcEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
    });

    vpc.addInterfaceEndpoint("ec2messagesVpcEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
    });

    vpc.addInterfaceEndpoint("cwlogsVpcEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
    });

    const bucket = new s3.Bucket(this, "bucket", {
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
          StringNotEquals: {
            "aws:SourceVpce": ssmVpcEndpoint.vpcEndpointId,
          },
        },
      })
    );

    const userData = ec2.UserData.forLinux();
    userData.addCommands("echo gateway > /home/ec2-user/gateway.txt");
    userData.addCommands("echo interface > /home/ec2-user/interface.txt");

    const instance = new ec2.Instance(this, "instance", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      userData: userData,
      vpcSubnets: {
        subnetType: ec2.SubnetType.ISOLATED,
      },
    });

    instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonEC2RoleforSSM"
      )
    );

    const bucketName = new CfnOutput(this, "bucketName", {
      value: bucket.bucketName,
    });
  }
}

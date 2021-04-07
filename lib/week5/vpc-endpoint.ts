import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as iam from "@aws-cdk/aws-iam";
import * as s3 from "@aws-cdk/aws-s3";
import { CfnOutput } from "@aws-cdk/core";

export class VPCEndpointStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
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

    const ssm_vpc_endpoint = vpc.addInterfaceEndpoint("ssm_vpc_endpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.SSM,
    });

    vpc.addInterfaceEndpoint("ssmmessages_vpc_endpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
    });

    const bucket = new s3.Bucket(this, "bucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        actions: ["s3:PutObject"],
        principals: [new iam.AnyPrincipal()],
        resources: [bucket.bucketArn, `${bucket.bucketArn}/*`],
        conditions: {
          StringNotEquals: {
            "aws:SourceVpce": ssm_vpc_endpoint.vpcEndpointId,
          },
        },
      })
    );

    const user_data = ec2.UserData.forLinux();
    user_data.addCommands("echo gateway > /home/ec2-user/gateway.txt");
    user_data.addCommands("echo interface > /home/ec2-user/interface.txt");

    const instance = new ec2.Instance(this, "instance", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      userData: user_data,
      vpcSubnets: {
        subnetType: ec2.SubnetType.ISOLATED,
      },
    });

    instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonEC2RoleforSSM"
      )
    );

    const output = new CfnOutput(this, "BucketName", {
      value: bucket.bucketName,
    });
  }
}

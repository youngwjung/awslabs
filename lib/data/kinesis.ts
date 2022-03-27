import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as cloud9 from "aws-cdk-lib/aws-cloud9";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as glue from "aws-cdk-lib/aws-glue";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as opensearch from "aws-cdk-lib/aws-opensearchservice";
import { Construct } from "constructs";

export class KinesisStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const iamUser = new iam.User(this, "iamUser", {
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess"),
      ],
      password: cdk.SecretValue.plainText("Asdf!234"),
      userName: "lab-user",
    });

    const vpc = new ec2.Vpc(this, "vpc", {
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    const cloud9Instance = new cloud9.CfnEnvironmentEC2(
      this,
      "cloud9Instance",
      {
        subnetId: vpc.publicSubnets[0].subnetId,
        instanceType: "t3.micro",
        name: "kinesis-lab",
        ownerArn: iamUser.userArn,
        automaticStopTimeMinutes: 30,
      }
    );

    const bucket = new s3.Bucket(this, "bucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const database = new glue.CfnDatabase(this, "database", {
      catalogId: this.account,
      databaseInput: {
        name: "kinesislab",
      },
    });

    const transformFunction = new lambda.Function(this, "transformFunction", {
      functionName: "NYCTaxiTrips-DataTransformation",
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset("lambda/kinesis"),
      handler: "transform.lambda_handler",
      timeout: cdk.Duration.seconds(60),
    });

    const kinesisAnalyticsRole = new iam.Role(this, "kinesisAnalyticsRole", {
      roleName: "Kinesis-analytics-KDA",
      assumedBy: new iam.ServicePrincipal("kinesisanalytics.amazonaws.com"),
    });

    kinesisAnalyticsRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess")
    );

    const domain = new opensearch.Domain(this, "domain", {
      domainName: "os-domain",
      version: opensearch.EngineVersion.OPENSEARCH_1_0,
      capacity: {
        dataNodeInstanceType: "t3.medium.search",
      },
      useUnsignedBasicAuth: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new cdk.CfnOutput(this, "BucketName", {
      value: bucket.bucketName,
    });
  }
}

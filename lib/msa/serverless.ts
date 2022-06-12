import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as eks from "aws-cdk-lib/aws-eks";
import * as cloud9 from "aws-cdk-lib/aws-cloud9";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cr from "aws-cdk-lib/custom-resources";

export class ServerlessStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /* Networking */
    const vpc = new ec2.Vpc(this, "vpc", {
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    /* IAM users */
    const iamUser = new iam.User(this, "iamUser", {
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess"),
      ],
      password: cdk.SecretValue.unsafePlainText("Asdf!234"),
      userName: "lab-user",
    });

    /* Cloud9 */
    const cloud9Instance = new cloud9.CfnEnvironmentEC2(
      this,
      "cloud9Instance",
      {
        subnetId: vpc.publicSubnets[0].subnetId,
        instanceType: "t3.micro",
        name: "serverless-lab",
        ownerArn: iamUser.userArn,
        automaticStopTimeMinutes: 30,
      }
    );
  }
}

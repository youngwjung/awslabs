import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import { CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";

export class CognitoStack extends cdk.Stack {
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
    userData.addCommands("echo cognito > /home/ec2-user/sample.txt");

    const instance = new ec2.Instance(this, "instance", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      userData: userData,
    });

    instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonEC2RoleforSSM"
      )
    );

    const userPool = new cognito.UserPool(this, "userPool");

    const appClient = userPool.addClient("appClient");

    const identityPool = new cognito.CfnIdentityPool(this, "identityPool", {
      allowUnauthenticatedIdentities: true,
      cognitoIdentityProviders: [
        {
          providerName: userPool.userPoolProviderName,
          clientId: appClient.userPoolClientId,
        },
      ],
    });

    const unauthenticatedRole = new iam.Role(this, "unauthenticatedRole", {
      assumedBy: new iam.FederatedPrincipal(
        "cognito-identity.amazonaws.com",
        {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": identityPool.ref,
          },
          "ForAnyValue:StringLike": {
            "cognito-identity.amazonaws.com:amr": "unauthenticated",
          },
        },
        "sts:AssumeRoleWithWebIdentity"
      ),
    });

    const authenticatedRole = new iam.Role(this, "authenticatedRole", {
      assumedBy: new iam.FederatedPrincipal(
        "cognito-identity.amazonaws.com",
        {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": identityPool.ref,
          },
          "ForAnyValue:StringLike": {
            "cognito-identity.amazonaws.com:amr": "authenticated",
          },
        },
        "sts:AssumeRoleWithWebIdentity"
      ),
    });

    const identityPoolRoleAttachment =
      new cognito.CfnIdentityPoolRoleAttachment(
        this,
        "identityPoolRoleAttachment",
        {
          identityPoolId: identityPool.ref,
          roles: {
            unauthenticated: unauthenticatedRole.roleArn,
            authenticated: authenticatedRole.roleArn,
          },
        }
      );

    const bucket = new s3.Bucket(this, "bucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new CfnOutput(this, "bucketName", {
      value: bucket.bucketName,
    });

    new CfnOutput(this, "appClientId", {
      value: appClient.userPoolClientId,
    });

    new CfnOutput(this, "identityPoolId", {
      value: identityPool.ref,
    });
  }
}

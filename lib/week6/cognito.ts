import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as cognito from "@aws-cdk/aws-cognito";
import * as s3 from "@aws-cdk/aws-s3";
import * as iam from "@aws-cdk/aws-iam";
import { CfnOutput } from "@aws-cdk/core";

export class CognitoStack extends cdk.Stack {
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
    user_data.addCommands("echo cognito > /home/ec2-user/sample.txt");

    const instance = new ec2.Instance(this, "instance", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      userData: user_data,
    });

    instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonEC2RoleforSSM")
    );

    const user_pool = new cognito.UserPool(this, "user_pool");

    const app_client = user_pool.addClient("app_client");

    const identity_pool = new cognito.CfnIdentityPool(this, "identity_pool", {
      allowUnauthenticatedIdentities: true,
      cognitoIdentityProviders: [
        {
          providerName: user_pool.userPoolProviderName,
          clientId: app_client.userPoolClientId,
        },
      ],
    });

    const unauthenticated_role = new iam.Role(this, "unauthenticated_role", {
      assumedBy: new iam.FederatedPrincipal(
        "cognito-identity.amazonaws.com",
        {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": identity_pool.ref,
          },
          "ForAnyValue:StringLike": {
            "cognito-identity.amazonaws.com:amr": "unauthenticated",
          },
        },
        "sts:AssumeRoleWithWebIdentity"
      ),
    });

    const authenticated_role = new iam.Role(this, "authenticated_role", {
      assumedBy: new iam.FederatedPrincipal(
        "cognito-identity.amazonaws.com",
        {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": identity_pool.ref,
          },
          "ForAnyValue:StringLike": {
            "cognito-identity.amazonaws.com:amr": "authenticated",
          },
        },
        "sts:AssumeRoleWithWebIdentity"
      ),
    });

    const identity_pool_role_attachment = new cognito.CfnIdentityPoolRoleAttachment(
      this,
      "identity_pool_role_attachment",
      {
        identityPoolId: identity_pool.ref,
        roles: {
          unauthenticated: unauthenticated_role.roleArn,
          authenticated: authenticated_role.roleArn,
        },
      }
    );

    const bucket = new s3.Bucket(this, "bucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new CfnOutput(this, "bucket_name", {
      value: bucket.bucketName,
    });

    new CfnOutput(this, "app_client_id", {
      value: app_client.userPoolClientId,
    });

    new CfnOutput(this, "identity_pool_id", {
      value: identity_pool.ref,
    });
  }
}

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as eks from "aws-cdk-lib/aws-eks";
import * as cloud9 from "aws-cdk-lib/aws-cloud9";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cr from "aws-cdk-lib/custom-resources";

export class Eks101Stack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /* Networking */
    const vpc = new ec2.Vpc(this, "vpc", {
      vpcName: "eks-vpc",
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    /* IAM */
    const eksLabRole = new iam.Role(this, "eksLabRole", {
      roleName: "EKSLabRole",
      assumedBy: new iam.CompositePrincipal(
        new iam.AccountPrincipal(this.account)
      ),
      maxSessionDuration: cdk.Duration.seconds(43200),
    });

    eksLabRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess")
    );

    const eksMasterRole = new iam.Role(this, "eksMasterRole", {
      roleName: "eks-master-role",
      assumedBy: new iam.ServicePrincipal("ec2"),
    });

    const eksMasterRoleProfile = new iam.CfnInstanceProfile(
      this,
      "eksMasterRoleProfile",
      {
        instanceProfileName: eksMasterRole.roleName,
        roles: [eksMasterRole.roleName],
      }
    );

    eksMasterRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess")
    );

    /* Cloud9 */
    const cloud9Instance = new cloud9.CfnEnvironmentEC2(
      this,
      "cloud9Instance",
      {
        subnetId: vpc.publicSubnets[0].subnetId,
        instanceType: "t3.micro",
        name: "eks-lab",
        ownerArn: `arn:aws:sts::${this.account}:assumed-role/${eksLabRole.roleName}/${this.stackName}`,
        automaticStopTimeMinutes: 30,
      }
    );

    /* Kubernetes Cluster */
    // EKS
    const cluster = new eks.Cluster(this, "cluster", {
      clusterName: "eks",
      version: eks.KubernetesVersion.V1_21,
      defaultCapacity: 0,
      vpc: vpc,
      vpcSubnets: [
        {
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
      mastersRole: eksMasterRole,
      outputConfigCommand: false,
      endpointAccess: eks.EndpointAccess.PUBLIC,
    });

    cluster.adminRole.addToPrincipalPolicy(
      new iam.PolicyStatement({ actions: ["ec2:Describe*"], resources: ["*"] })
    );

    // NodeGroup
    const nodeGroup = cluster.addNodegroupCapacity("nodeGroup", {
      instanceTypes: [new ec2.InstanceType("t3.medium")],
      subnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      minSize: 2,
      maxSize: 10,
    });

    // Worker node permissions
    nodeGroup.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "AmazonEC2ContainerRegistryPowerUser"
      )
    );

    nodeGroup.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonEC2RoleforSSM"
      )
    );

    /* Login URL */
    const adminUser = new iam.User(this, "adminUser");

    adminUser.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["sts:AssumeRole"],
        resources: ["*"],
      })
    );

    const adminUserCred = new iam.AccessKey(this, "adminUserCred", {
      user: adminUser,
    });

    const loginUrlGenerator = new lambda.Function(this, "loginUrlGenerator", {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset("lambda/ekslab"),
      handler: "app.on_event",
      timeout: cdk.Duration.seconds(60),
    });

    // const loginUrlGeneratorRole = loginUrlGenerator.role;
    loginUrlGenerator.role!.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("IAMReadOnlyAccess")
    );

    const loginUrlProvider = new cr.Provider(this, "loginUrlProvider", {
      onEventHandler: loginUrlGenerator,
    });

    const loginUrl = new cdk.CustomResource(this, "CustomResource", {
      serviceToken: loginUrlProvider.serviceToken,
      properties: {
        RoleName: eksLabRole.roleName,
        RoleSessionName: this.stackName,
        UserName: adminUser.userName,
        AccessKeyId: adminUserCred.accessKeyId,
        SecretAccessKey: adminUserCred.secretAccessKey.toString(),
      },
    });

    loginUrl.node.addDependency(nodeGroup);

    new cdk.CfnOutput(this, "SignInURL", {
      value: loginUrl.getAtt("SignInURL").toString(),
    });
  }
}

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as eks from "aws-cdk-lib/aws-eks";
import * as cloud9 from "aws-cdk-lib/aws-cloud9";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cr from "aws-cdk-lib/custom-resources";
import * as logs from "aws-cdk-lib/aws-logs";

import * as yaml from "js-yaml";
import * as request from "sync-request";

export class Eks101Stack extends cdk.Stack {
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

    // EKS master role
    const eksMasterRole = new iam.Role(this, "eksMasterRole", {
      assumedBy: new iam.CompositePrincipal(
        new iam.AccountPrincipal(this.account)
      ),
    });

    eksMasterRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess")
    );

    // EKS
    const cluster = new eks.Cluster(this, "cluster", {
      version: eks.KubernetesVersion.V1_22,
      defaultCapacity: 0,
      outputMastersRoleArn: true,
      vpc: vpc,
      vpcSubnets: [
        {
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
      mastersRole: eksMasterRole,
    });

    cluster.adminRole.addToPrincipalPolicy(
      new iam.PolicyStatement({ actions: ["ec2:Describe*"], resources: ["*"] })
    );

    // NodeGroup
    const nodeGroupLaunchTemplate = new ec2.CfnLaunchTemplate(
      this,
      "nodeGroupLaunchTemplate",
      {
        launchTemplateData: {
          blockDeviceMappings: [
            {
              deviceName: "/dev/xvda",
              ebs: {
                volumeSize: 20,
                volumeType: "gp3",
              },
            },
          ],
          tagSpecifications: [
            {
              resourceType: "instance",
              tags: [
                {
                  key: "Name",
                  value: "eks-worker",
                },
              ],
            },
          ],
        },
      }
    );

    const nodeGroup = cluster.addNodegroupCapacity("nodeGroup", {
      labels: {
        "node-group": "worker",
      },
      launchTemplateSpec: {
        id: nodeGroupLaunchTemplate.ref,
        version: nodeGroupLaunchTemplate.attrLatestVersionNumber,
      },
      instanceTypes: [new ec2.InstanceType("t3.medium")],
      subnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      minSize: 1,
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

    // AWS Auth
    cluster.awsAuth.addMastersRole(eksMasterRole);

    /* Login URL */
    const loginUrlGenerator = new lambda.Function(this, "loginUrlGenerator", {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset("lambda/ekslab"),
      handler: "app.on_event",
    });

    loginUrlGenerator.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["sts:AssumeRole"],
        resources: ["*"],
      })
    );

    const loginUrlProvider = new cr.Provider(this, "loginUrlProvider", {
      onEventHandler: loginUrlGenerator,
    });

    const loginUrl = new cdk.CustomResource(this, "CustomResource", {
      serviceToken: loginUrlProvider.serviceToken,
      properties: {
        RoleName: eksLabRole.roleName,
        RoleSessionName: this.stackName,
      },
    });

    new cdk.CfnOutput(this, "SignInURL", {
      value: loginUrl.getAtt("SignInURL").toString(),
    });
  }
}

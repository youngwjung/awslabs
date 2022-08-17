import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as eks from "aws-cdk-lib/aws-eks";
import * as cloud9 from "aws-cdk-lib/aws-cloud9";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cr from "aws-cdk-lib/custom-resources";

export class Eks101EventEngineStack extends cdk.Stack {
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
        ownerArn: `arn:aws:sts::${this.account}:assumed-role/TeamRole/MasterKey`,
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
  }
}

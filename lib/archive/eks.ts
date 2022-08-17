import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as eks from "aws-cdk-lib/aws-eks";
import * as cloud9 from "aws-cdk-lib/aws-cloud9";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cr from "aws-cdk-lib/custom-resources";

export class EksStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
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

    const eksMasterRole = new iam.Role(this, "eksMasterRole", {
      roleName: "eks-master-role",
      assumedBy: new iam.AccountPrincipal(this.account),
    });

    const cluster = new eks.Cluster(this, "cluster", {
      clusterName: "mycluster",
      version: eks.KubernetesVersion.V1_21,
      defaultCapacity: 0,
      vpc: vpc,
      vpcSubnets: [
        {
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
      endpointAccess: eks.EndpointAccess.PUBLIC,
    });

    // NodeGroup
    const nodeGroup = cluster.addNodegroupCapacity("nodeGroup", {
      instanceTypes: [new ec2.InstanceType("t3.small")],
      subnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      minSize: 2,
      maxSize: 4,
    });

    // Worker node permissions
    nodeGroup.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "AmazonEC2ContainerRegistryPowerUser"
      )
    );

    nodeGroup.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")
    );
  }
}

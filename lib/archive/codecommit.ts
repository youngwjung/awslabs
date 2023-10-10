import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as codecommit from "aws-cdk-lib/aws-codecommit";
import { Construct } from "constructs";

export class CodeCommitStack extends cdk.Stack {
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

    const devInstance = new ec2.Instance(this, "devInstance", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      instanceName: "dev",
    });

    const leadInstance = new ec2.Instance(this, "leadInstance", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      instanceName: "lead",
    });

    devInstance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonEC2RoleforSSM"
      )
    );

    leadInstance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonEC2RoleforSSM"
      )
    );

    const repo = new codecommit.Repository(this, "repo", {
      repositoryName: "guess",
    });

    const leadUser = new iam.User(this, "leadUser", {
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ReadOnlyAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("IAMFullAccess"),
      ],
      password: cdk.SecretValue.unsafePlainText("Asdf!234"),
      userName: "lead",
    });

    const devUser = new iam.User(this, "devUser", {
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess"),
      ],
      password: cdk.SecretValue.unsafePlainText("Asdf!234"),
      userName: "dev",
    });

    repo.grantRead(leadUser);
    repo.grantRead(devUser);
  }
}

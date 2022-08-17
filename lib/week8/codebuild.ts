import * as cdk from "aws-cdk-lib";
import * as codecommit from "aws-cdk-lib/aws-codecommit";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as cr from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";

export class CodeBuildStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const repository = new codecommit.Repository(this, "repository", {
      repositoryName: "flask-app",
      code: codecommit.Code.fromDirectory("assets/codebuild"),
    });

    const registry = new ecr.Repository(this, "registry", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const buildProject = new codebuild.Project(this, "buildProject", {
      source: codebuild.Source.codeCommit({
        repository: repository,
      }),
      environmentVariables: {
        ECR_REPOSITORY: {
          value: registry.repositoryName,
        },
        AWS_ACCOUNT_ID: {
          value: this.account
        },
      },
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
    
    const instance = new ec2.Instance(this, "instance", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
    });

    instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")
    );

    const startBuild = new lambda.Function(this, "startBuild", {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset("lambda/codebuild"),
      handler: "app.on_event",
      timeout: cdk.Duration.seconds(60),
    });

    startBuild.role!.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AWSCodeBuildDeveloperAccess")
    );

    const startBuildProvider = new cr.Provider(this, "startBuildProvider", {
      onEventHandler: startBuild,
    });

    const runBuild = new cdk.CustomResource(this, "runBuild", {
      serviceToken: startBuildProvider.serviceToken,
      properties: {
        ProjectName: buildProject.projectName,
      },
    });

    runBuild.node.addDependency(buildProject);
    
    new cdk.CfnOutput(this, "CodeCommitRepositoryName", {
      value: repository.repositoryName,
    });

    new cdk.CfnOutput(this, "EcrRepositoryName", {
      value: registry.repositoryName,
    });

    new cdk.CfnOutput(this, "CodeBuildProjectName", {
      value: buildProject.projectName,
    });
    
    new cdk.CfnOutput(this, "InstanceId", {
      value: instance.instanceId,
    });
  }
}

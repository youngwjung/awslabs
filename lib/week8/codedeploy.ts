import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as codecommit from "aws-cdk-lib/aws-codecommit";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as codedeploy from "aws-cdk-lib/aws-codedeploy";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as codepipeline_actions from "aws-cdk-lib/aws-codepipeline-actions";
import * as kms from "aws-cdk-lib/aws-kms";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export class CodeDeployStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "vpc", {
      natGateways: 0,
      maxAzs: 4,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    const asg = new autoscaling.AutoScalingGroup(this, "asg", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      minCapacity: 2,
      maxCapacity: 4,
    });

    asg.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")
    );

    const alb = new elbv2.ApplicationLoadBalancer(this, "alb", {
      vpc: vpc,
      internetFacing: true,
      idleTimeout: cdk.Duration.seconds(1),
    });

    const httpListener = alb.addListener("httpListener", {
      port: 80,
      open: true,
    });

    const targetGroup = httpListener.addTargets("targetGroup", {
      port: 80,
      targets: [asg],
      deregistrationDelay: cdk.Duration.seconds(10),
      healthCheck: {
        healthyThresholdCount: 2,
        interval: cdk.Duration.seconds(5),
        timeout: cdk.Duration.seconds(2),
        port: "8080",
      },
    });

    asg.connections.allowFrom(alb, ec2.Port.tcp(80));

    const repository = new codecommit.Repository(this, "repository", {
      repositoryName: "my-web",
      code: codecommit.Code.fromDirectory("assets/codedeploy"),
    });

    const encryptionKey = new kms.Key(this, "encryptionKey", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pendingWindow: cdk.Duration.days(7),
    });

    const bucket = new s3.Bucket(this, "bucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const buildProject = new codebuild.PipelineProject(this, "buildProject", {
      encryptionKey: encryptionKey,
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2,
      },
    });

    const application = new codedeploy.ServerApplication(this, "application", {
      applicationName: "my-web-application",
    });

    const deploymentGroup = new codedeploy.ServerDeploymentGroup(
      this,
      "deploymentGroup",
      {
        application: application,
        autoScalingGroups: [asg],
        loadBalancer: codedeploy.LoadBalancer.application(targetGroup),
        installAgent: false,
      }
    );

    const pipeline = new codepipeline.Pipeline(this, "pipeline", {
      artifactBucket: bucket,
    });

    const sourceOutput = new codepipeline.Artifact();

    const sourceAction = new codepipeline_actions.CodeCommitSourceAction({
      actionName: "CodeCommit",
      repository: repository,
      output: sourceOutput,
      branch: "main",
    });

    pipeline.addStage({
      stageName: "Source",
      actions: [sourceAction],
    });

    const buildOutput = new codepipeline.Artifact();

    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: "CodeBuild",
      project: buildProject,
      input: sourceOutput,
      outputs: [buildOutput],
    });

    pipeline.addStage({
      stageName: "Build",
      actions: [buildAction],
    });

    const deployAction = new codepipeline_actions.CodeDeployServerDeployAction({
      actionName: "CodeDeploy",
      input: buildOutput,
      deploymentGroup,
    });
    pipeline.addStage({
      stageName: "Deploy",
      actions: [deployAction],
    });

    new cdk.CfnOutput(this, "CodePipelineName", {
      value: pipeline.pipelineName,
    });

    new cdk.CfnOutput(this, "SiteURL", {
      value: alb.loadBalancerDnsName,
    });
  }
}

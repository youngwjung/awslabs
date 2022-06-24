import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { InstanceTarget } from "aws-cdk-lib/aws-elasticloadbalancingv2-targets";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as waf from "aws-cdk-lib/aws-wafv2";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";

export class SecretsAnswerStack extends cdk.Stack {
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
    userData.addCommands("yum update -y && yum install -y httpd git");
    userData.addCommands(
      "cd /var/www/html && git clone https://github.com/youngwjung/static-html-sample.git ."
    );
    userData.addCommands("systemctl enable httpd");
    userData.addCommands("systemctl start httpd");

    const instance = new ec2.Instance(this, "instance", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      userData: userData,
    });

    const alb = new elbv2.ApplicationLoadBalancer(this, "alb", {
      vpc: vpc,
      internetFacing: true,
    });

    const httpListener = alb.addListener("httpListener", {
      port: 80,
      open: true,
    });

    httpListener.addTargets("webTarget", {
      port: 80,
      targets: [new InstanceTarget(instance)],
    });

    instance.connections.allowFrom(alb, ec2.Port.tcp(80));

    const cfHeader = new secretsmanager.Secret(this, "cfHeader", {
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 20,
      },
    });

    const wafAlb = new waf.CfnWebACL(this, "wafAlb", {
      name: "acl-originVerify",
      scope: "REGIONAL",
      defaultAction: {
        block: {},
      },
      rules: [
        {
          name: "CFOriginVerifyXOriginVerify",
          priority: 0,
          action: {
            allow: {},
          },
          statement: {
            byteMatchStatement: {
              fieldToMatch: {
                singleHeader: {
                  Name: "x-origin-verify",
                },
              },
              positionalConstraint: "EXACTLY",
              searchString: cfHeader.secretValue.toString(),
              textTransformations: [
                {
                  priority: 0,
                  type: "COMPRESS_WHITE_SPACE",
                },
              ],
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "CFOriginVerifyXOriginVerify",
            sampledRequestsEnabled: true,
          },
        },
      ],
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: "CFOriginVerifyXOriginVerify",
        sampledRequestsEnabled: true,
      },
    });

    new waf.CfnWebACLAssociation(this, "wafAlbAssociation", {
      resourceArn: alb.loadBalancerArn,
      webAclArn: wafAlb.attrArn,
    });

    const cf = new cloudfront.Distribution(this, "cf", {
      defaultBehavior: {
        origin: new origins.LoadBalancerV2Origin(alb, {
          customHeaders: {
            "X-Origin-Verify": cfHeader.secretValue.toString(),
          },
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
        }),
      },
    });

    // Lambda (Rotate the secret created above)
    const secretRotateLambda = new lambda.Function(this, "secretRotateLambda", {
      runtime: lambda.Runtime.PYTHON_3_7,
      code: lambda.Code.fromAsset("lambda/secrets-answer"),
      handler: "rotate.lambda_handler",
      timeout: cdk.Duration.seconds(300),
    });

    secretRotateLambda.addPermission("allowSm", {
      principal: new iam.ServicePrincipal("secretsmanager.amazonaws.com"),
    });

    secretRotateLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "secretsmanager:GetRandomPassword",
          "secretsmanager:UpdateSecretVersionStage",
        ],
        resources: ["*"],
        effect: iam.Effect.ALLOW,
      })
    );

    secretRotateLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "cloudfront:GetDistributionConfig",
          "cloudfront:UpdateDistribution",
        ],
        resources: ["*"],
        effect: iam.Effect.ALLOW,
      })
    );

    secretRotateLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["wafv2:UpdateWebACL", "wafv2:GetWebACL"],
        resources: ["*"],
        effect: iam.Effect.ALLOW,
      })
    );

    cfHeader.grantRead(secretRotateLambda);
    cfHeader.grantWrite(secretRotateLambda);

    cfHeader.addRotationSchedule("secretRotateSchedule", {
      rotationLambda: secretRotateLambda,
      automaticallyAfter: cdk.Duration.days(30),
    });

    secretRotateLambda.addEnvironment("WAF_ID", wafAlb.attrId);
    secretRotateLambda.addEnvironment("WAF_NAME", wafAlb.name!);
    secretRotateLambda.addEnvironment("DISTRIBUTION_ID", cf.distributionId);

    new CfnOutput(this, "albDnsName", {
      value: alb.loadBalancerDnsName,
    });

    new CfnOutput(this, "cfDnsName", {
      value: cf.distributionDomainName,
    });
  }
}

import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as elbv2 from "@aws-cdk/aws-elasticloadbalancingv2";
import { InstanceTarget } from "@aws-cdk/aws-elasticloadbalancingv2-targets";
import * as secretsmanager from "@aws-cdk/aws-secretsmanager";
import * as waf from "@aws-cdk/aws-wafv2";
import * as cloudfront from "@aws-cdk/aws-cloudfront";
import * as origins from "@aws-cdk/aws-cloudfront-origins";
import * as iam from "@aws-cdk/aws-iam";
import * as lambda from "@aws-cdk/aws-lambda";
import { CfnOutput } from "@aws-cdk/core";

export class SecretsAnswerStack extends cdk.Stack {
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
    user_data.addCommands("yum update -y && yum install -y httpd git");
    user_data.addCommands(
      "cd /var/www/html && git clone https://github.com/youngwjung/static-html-sample.git ."
    );
    user_data.addCommands("systemctl enable httpd");
    user_data.addCommands("systemctl start httpd");

    const instance = new ec2.Instance(this, "instance", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      userData: user_data,
    });

    const alb = new elbv2.ApplicationLoadBalancer(this, "alb", {
      vpc: vpc,
      internetFacing: true,
    });

    const http_listener = alb.addListener("http_listener", {
      port: 80,
      open: true,
    });

    http_listener.addTargets("web_target", {
      port: 80,
      targets: [new InstanceTarget(instance)],
    });

    instance.connections.allowFrom(alb, ec2.Port.tcp(80));

    const cf_header = new secretsmanager.Secret(this, "cf_header", {
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 20,
      },
    });

    const waf_alb = new waf.CfnWebACL(this, "waf_alb", {
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
              searchString: cf_header.secretValue.toString(),
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

    new waf.CfnWebACLAssociation(this, "waf_alb_association", {
      resourceArn: alb.loadBalancerArn,
      webAclArn: waf_alb.attrArn,
    });

    const cf = new cloudfront.Distribution(this, "cf", {
      defaultBehavior: {
        origin: new origins.LoadBalancerV2Origin(alb, {
          customHeaders: {
            "X-Origin-Verify": cf_header.secretValue.toString(),
          },
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
        }),
      },
    });

    // Lambda (Rotate the secret created above)
    const secret_rotate_lambda = new lambda.Function(
      this,
      "secret_rotate_lambda",
      {
        runtime: lambda.Runtime.PYTHON_3_7,
        code: lambda.Code.fromAsset("lambda/secrets-answer"),
        handler: "rotate.lambda_handler",
        timeout: cdk.Duration.seconds(300),
      }
    );

    secret_rotate_lambda.addPermission("allow_sm", {
      principal: new iam.ServicePrincipal("secretsmanager.amazonaws.com"),
    });

    secret_rotate_lambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "secretsmanager:GetRandomPassword",
          "secretsmanager:UpdateSecretVersionStage",
        ],
        resources: ["*"],
        effect: iam.Effect.ALLOW,
      })
    );

    secret_rotate_lambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "cloudfront:GetDistributionConfig",
          "cloudfront:UpdateDistribution",
        ],
        resources: ["*"],
        effect: iam.Effect.ALLOW,
      })
    );

    secret_rotate_lambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["wafv2:UpdateWebACL", "wafv2:GetWebACL"],
        resources: ["*"],
        effect: iam.Effect.ALLOW,
      })
    );

    cf_header.grantRead(secret_rotate_lambda);
    cf_header.grantWrite(secret_rotate_lambda);

    cf_header.addRotationSchedule("secret_rotate_schedule", {
      rotationLambda: secret_rotate_lambda,
      automaticallyAfter: cdk.Duration.days(30),
    });

    secret_rotate_lambda.addEnvironment("WAF_ID", waf_alb.attrId);
    secret_rotate_lambda.addEnvironment("WAF_NAME", waf_alb.name!);
    secret_rotate_lambda.addEnvironment("DISTRIBUTION_ID", cf.distributionId);

    new CfnOutput(this, "alb_dns_name", {
      value: alb.loadBalancerDnsName,
    });

    new CfnOutput(this, "cf_dns_name", {
      value: cf.distributionDomainName,
    });
  }
}

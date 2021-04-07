#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "@aws-cdk/core";
import { EipStack } from "../lib/week1/eip";
import { EbsStack } from "../lib/week1/ebs";
import { CliStack } from "../lib/week1/cli";
import { SslStack } from "../lib/week2/ssl";
import { ElbStack } from "../lib/week2/elb";
import { AsgStack } from "../lib/week2/asg";
import { SqsStack } from "../lib/week2/sqs";
import { ColorStack } from "../lib/week2/color";
import { VpcStack } from "../lib/week3/vpc";
import { TransitStack } from "../lib/week3/transit";
import { PresignedStack } from "../lib/week5/presigned";
import { VPCEndpointStack } from "../lib/week5/vpc-endpoint";
import { EfsStack } from "../lib/week5/efs";
import { AlblogStack } from "../lib/week6/alb-log";
import { StsStack } from "../lib/week6/sts";
import { KmsStack } from "../lib/week6/kms";
import { GuarddutyStack } from "../lib/week6/guard-duty";
import { CognitoStack } from "../lib/week6/cognito";
import { SecretsStack } from "../lib/week6/secrets";
import { SecretsAnswerStack } from "../lib/week6/secrets-answer";
import { CwlogStack } from "../lib/week7/cw-log";
import { CwmetricStack } from "../lib/week7/cw-metric";
import { CweventStack } from "../lib/week7/cw-event";
import { PortforwadingStack } from "../lib/week7/port-forwarding";
import { ConfigStack } from "../lib/week7/config";

const app = new cdk.App();
new EipStack(app, "eip");
new EbsStack(app, "ebs");
new CliStack(app, "cli");
new SslStack(app, "ssl");
new ElbStack(app, "elb");
new AsgStack(app, "asg");
new SqsStack(app, "sqs");
new ColorStack(app, "color");
new VpcStack(app, "vpc");
new TransitStack(app, "transit");
new PresignedStack(app, "presigned");
new VPCEndpointStack(app, "vpcendpoint");
new EfsStack(app, "efs");
new AlblogStack(app, "alb-log", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
new StsStack(app, "sts");
new KmsStack(app, "kms");
new GuarddutyStack(app, "guard-duty");
new CognitoStack(app, "cognito");
new SecretsStack(app, "secrets");
new SecretsAnswerStack(app, "secrets-answer");
new CwlogStack(app, "cw-log");
new CwmetricStack(app, "cw-metric");
new CweventStack(app, "cw-event");
new PortforwadingStack(app, "port-forwarding");
new ConfigStack(app, "config");

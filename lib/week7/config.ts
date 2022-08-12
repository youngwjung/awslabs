import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export class ConfigStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const automationRole = new iam.Role(this, "automationRole", {
      assumedBy: new iam.ServicePrincipal("ssm.amazonaws.com"),
    });

    automationRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonSSMAutomationRole"
      )
    );
    automationRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["iam:PassRole"],
        resources: ["*"],
      })
    );

    automationRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ec2:RevokeSecurityGroupIngress"],
        resources: ["*"],
      })
    );

    new cdk.CfnOutput(this, "AutomationRoleArn", {
      value: automationRole.roleArn,
    });
  }
}

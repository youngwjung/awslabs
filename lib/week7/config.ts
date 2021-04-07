import * as cdk from "@aws-cdk/core";
import * as iam from "@aws-cdk/aws-iam";
import { CfnOutput } from "@aws-cdk/core";

export class ConfigStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const automation_role = new iam.Role(this, "automation_role", {
      assumedBy: new iam.ServicePrincipal("ssm.amazonaws.com"),
    });

    automation_role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonSSMAutomationRole"
      )
    );
    automation_role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["iam:PassRole"],
        resources: ["*"],
      })
    );

    automation_role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ec2:RevokeSecurityGroupIngress"],
        resources: ["*"],
      })
    );

    new CfnOutput(this, "AutomationRoleArn", {
      value: automation_role.roleArn,
    });
  }
}

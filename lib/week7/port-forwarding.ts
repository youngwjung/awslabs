import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as rds from "@aws-cdk/aws-rds";
import { CfnOutput } from "@aws-cdk/core";

export class PortforwadingStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "vpc", {
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: "private",
          subnetType: ec2.SubnetType.PRIVATE,
        },
        {
          cidrMask: 24,
          name: "database",
          subnetType: ec2.SubnetType.ISOLATED,
        },
      ],
    });

    const bastion_host = new ec2.BastionHostLinux(this, "bastion_host", {
      vpc: vpc,
    });

    const mysql = new rds.DatabaseInstance(this, "mysql", {
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0_21,
      }),
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      allocatedStorage: 20,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      vpcSubnets: {
        subnetType: ec2.SubnetType.ISOLATED,
      },
    });

    mysql.connections.allowDefaultPortFrom(bastion_host);

    new CfnOutput(this, "MySQLConnectionSecret", {
      value: mysql.secret?.secretName!,
    });

    new CfnOutput(this, "MySQLEndpoint", {
      value: mysql.instanceEndpoint.socketAddress,
    });
  }
}

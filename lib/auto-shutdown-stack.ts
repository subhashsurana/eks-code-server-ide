import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { AutoShutdown } from './auto-shutdown';
import { ParameterNaming } from './parameter-naming';

export interface AutoShutdownStackProps extends cdk.StackProps {
  idleTimeoutMinutes?: number;
  appName?: string;
  environment?: string;
}

export class AutoShutdownStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: AutoShutdownStackProps) {
    super(scope, id, props);

    // Get instance ID from SSM parameter (created by main stack)
    const appName = props?.appName ?? 'code-server-ide';
    const environment = props?.environment ?? 'dev';
    const naming = new ParameterNaming(appName, this.account, environment);
    const parameterName = naming.generateParameterName('compute', 'instance-id');
    const instanceIdParam = ssm.StringParameter.fromStringParameterName(this, 'InstanceIdParam', parameterName);
    const instanceId = instanceIdParam.stringValue;

    // Create auto-shutdown
    new AutoShutdown(this, 'AutoShutdown', {
      instanceId: instanceId,
      idleTimeoutMinutes: props?.idleTimeoutMinutes ?? 30
    });

    // Output
    new cdk.CfnOutput(this, 'AutoShutdownStatus', {
      value: `Auto-shutdown enabled for instance: ${instanceId}`,
      description: 'Auto-shutdown configuration status'
    });
  }
}
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface AutoShutdownProps {
  instanceId: string;
  idleTimeoutMinutes?: number;
}

export class AutoShutdown extends Construct {
  constructor(scope: Construct, id: string, props: AutoShutdownProps) {
    super(scope, id);

    const idleTimeout = props.idleTimeoutMinutes ?? 30; // 30 minutes default

    // Lambda to check idle and shutdown
    const shutdownFunction = new lambda.Function(this, 'IdleShutdownFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'auto-shutdown-handler.lambda_handler',
      timeout: cdk.Duration.minutes(5),
      code: lambda.Code.fromAsset('lib/lambda'),
      environment: {
        INSTANCE_ID: props.instanceId,
        IDLE_TIMEOUT_MINUTES: idleTimeout.toString()
      }
    });

    // Grant permissions
    shutdownFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ec2:StopInstances',
        'ec2:DescribeInstances',
        'cloudwatch:GetMetricStatistics'
      ],
      resources: ['*']
    }));

    // Schedule to run every 15 minutes
    const rule = new events.Rule(this, 'IdleCheckRule', {
      schedule: events.Schedule.rate(cdk.Duration.minutes(15))
    });

    rule.addTarget(new targets.LambdaFunction(shutdownFunction));
  }
}
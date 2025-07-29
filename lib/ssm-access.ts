import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';

import { Construct } from 'constructs';

export interface SSMAccessProps {
  allowedUsers?: string[];  // IAM users/roles that can access
  allowedGroups?: string[]; // IAM groups that can access
}

export class SSMAccess extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    // IAM policy for SSM access to code-server instances
    const ssmAccessPolicy = new iam.ManagedPolicy(this, 'CodeServerSSMAccess', {
      managedPolicyName: `${cdk.Stack.of(this).stackName}-ssm-access`,
      description: 'Allow SSM access to code-server instances',
      statements: [
        new iam.PolicyStatement({
          sid: 'SSMSessionAccess',
          effect: iam.Effect.ALLOW,
          actions: [
            'ssm:StartSession'
          ],
          resources: [
            `arn:aws:ec2:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:instance/*`
          ],
          conditions: {
            StringEquals: {
              'ssm:resourceTag/Project': 'code-server-ide'
            }
          }
        }),
        new iam.PolicyStatement({
          sid: 'SSMSessionDocument',
          effect: iam.Effect.ALLOW,
          actions: [
            'ssm:DescribeSessions',
            'ssm:GetConnectionStatus',
            'ssm:DescribeInstanceInformation'
          ],
          resources: ['*']
        })
      ]
    });

    // Note: Policy created but not attached to users/groups
    // Attach manually via AWS Console or CLI to existing users/groups

    // Output policy ARN for manual attachment
    new cdk.CfnOutput(this, 'SSMAccessPolicyArn', {
      value: ssmAccessPolicy.managedPolicyArn,
      description: 'IAM policy ARN for SSM access to code-server'
    });
  }
}
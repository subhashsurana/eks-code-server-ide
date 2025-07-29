import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class WorkshopPolicies {
  static addToRole(scope: Construct, role: iam.Role, stackName: string, account: string): void {
    // IAM Policy - Role management for EKS
    role.addManagedPolicy(new iam.ManagedPolicy(scope, 'EksWorkshopIamPolicy', {
      managedPolicyName: `${stackName}-iam`,
      description: 'IAM permissions for EKS workshop role management',
      statements: [
        new iam.PolicyStatement({
          sid: 'EksWorkshopRoleManagement',
          effect: iam.Effect.ALLOW,
          actions: [
            'iam:CreateRole',
            'iam:GetRolePolicy', 
            'iam:DetachRolePolicy',
            'iam:AttachRolePolicy',
            'iam:PutRolePolicy',
            'iam:DeleteRolePolicy',
            'iam:DeleteRole',
            'iam:ListInstanceProfilesForRole',
            'iam:ListAttachedRolePolicies',
            'iam:ListRolePolicies',
            'iam:TagRole',
            'iam:PassRole',
            'sts:AssumeRole'
          ],
          resources: [
            `arn:aws:iam::${account}:role/EksCodeServerIdeStack-*`,  // Current stack roles
            `arn:aws:iam::${account}:role/code-server-ide*`,         // Workshop-created roles
            `arn:aws:iam::${account}:role/cdk-*`,                    // CDK-created EKS roles
            `arn:aws:iam::${account}:role/eksctl-*`                  // eksctl-created roles (workshop commands)
          ]
        }),
        new iam.PolicyStatement({
          sid: 'ServiceLinkedRoleManagement',
          effect: iam.Effect.ALLOW,
          actions: [
            'iam:DeleteServiceLinkedRole',
            'iam:GetServiceLinkedRoleDeletionStatus'
          ],
          resources: [
            `arn:aws:iam::${account}:role/aws-service-role/fis*`  // Fault Injection Service
          ]
        })
      ]
    }));

    // Base EKS Policy - Core EKS operations
    role.addManagedPolicy(new iam.ManagedPolicy(scope, 'EksWorkshopBasePolicy', {
      managedPolicyName: `${stackName}-base`,
      description: 'Core EKS and EC2 permissions for workshop',
      statements: [
        new iam.PolicyStatement({
          sid: 'EksClusterOperations',
          effect: iam.Effect.ALLOW,
          actions: ['eks:*'],
          resources: ['*']
        }),
        new iam.PolicyStatement({
          sid: 'Ec2LaunchTemplates',
          effect: iam.Effect.ALLOW,
          actions: [
            'ec2:CreateLaunchTemplate',
            'ec2:DeleteLaunchTemplate'
          ],
          resources: ['*']
        }),
        new iam.PolicyStatement({
          sid: 'IdentityOperations',
          effect: iam.Effect.ALLOW,
          actions: ['sts:GetCallerIdentity'],
          resources: ['*']
        })
      ]
    }));

    // EC2 Policy - Instance and networking operations
    role.addManagedPolicy(new iam.ManagedPolicy(scope, 'EksWorkshopEc2Policy', {
      managedPolicyName: `${stackName}-ec2`,
      description: 'EC2 permissions for EKS node groups and networking',
      statements: [
        new iam.PolicyStatement({
          sid: 'Ec2ReadOperations',
          effect: iam.Effect.ALLOW,
          actions: [
            'ec2:Get*',
            'ec2:Describe*',
            'ec2:List*'
          ],
          resources: ['*']
        }),
        new iam.PolicyStatement({
          sid: 'Ec2InstanceOperations',
          effect: iam.Effect.ALLOW,
          actions: [
            'ec2:RunInstances',
            'ec2:ImportKeyPair',
            'ec2:DeleteKeyPair'
          ],
          resources: ['*']
        })
      ]
    }));

    // Additional workshop-specific policies can be added here
    // e.g., CloudFormation, Auto Scaling, Load Balancer permissions
  }
}
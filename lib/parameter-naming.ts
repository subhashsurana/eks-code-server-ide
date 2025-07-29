export interface ParameterConfig {
  appName: string;
  environment: string;
  resourceConfigs: Record<string, {
    resourceType: string;
    resourceName: string;
    defaultValue: string;
    description: string;
  }>;
}

export class ParameterNaming {
  private readonly appName: string;
  private readonly accountId: string;
  private readonly environment: string;

  constructor(appName: string, accountId: string, environment: string) {
    this.appName = appName;
    this.accountId = accountId;
    this.environment = environment;
  }

  generateParameterName(resourceType: string, resourceName: string): string {
    return `/${this.appName}/${this.accountId}/${this.environment}/${resourceType}/${resourceName}`;
  }

  static getResourceConfigs(): Record<string, { resourceType: string; resourceName: string; defaultValue: string; description: string }> {
    return {
      instanceVolumeSize: {
        resourceType: 'compute',
        resourceName: 'instance-volume-size',
        defaultValue: '30',
        description: 'EBS volume size for IDE instance'
      },
      repositoryOwner: {
        resourceType: 'git',
        resourceName: 'repository-owner',
        defaultValue: 'aws-samples',
        description: 'GitHub repository owner'
      },
      repositoryName: {
        resourceType: 'git',
        resourceName: 'repository-name',
        defaultValue: 'eks-workshop-v2',
        description: 'GitHub repository name'
      },
      repositoryRef: {
        resourceType: 'git',
        resourceName: 'repository-ref',
        defaultValue: 'main',
        description: 'Git reference (branch/tag)'
      },
      codeServerVersion: {
        resourceType: 'application',
        resourceName: 'code-server-version',
        defaultValue: '4.102.2',
        description: 'Code-server version to install'
      },
      vpcCidr: {
        resourceType: 'network',
        resourceName: 'vpc-cidr',
        defaultValue: '10.0.0.0/24',
        description: 'VPC CIDR block'
      },
      instanceType: {
        resourceType: 'compute',
        resourceName: 'instance-type',
        defaultValue: 't3.small',
        description: 'EC2 instance type'
      }
    };
  }
}
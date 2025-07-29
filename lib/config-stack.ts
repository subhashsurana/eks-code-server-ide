import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { ParameterNaming } from './parameter-naming';

export interface ConfigStackProps extends cdk.StackProps {
  appName?: string;
  environment?: string;
}

export class ConfigStack extends cdk.Stack {
  public readonly instanceVolumeSize: ssm.StringParameter;
  public readonly repositoryOwner: ssm.StringParameter;
  public readonly repositoryName: ssm.StringParameter;
  public readonly repositoryRef: ssm.StringParameter;
  public readonly codeServerVersion: ssm.StringParameter;
  public readonly vpcCidr: ssm.StringParameter;
  public readonly instanceType: ssm.StringParameter;

  constructor(scope: Construct, id: string, props?: ConfigStackProps) {
    super(scope, id, props);

    const appName = props?.appName ?? 'code-server-ide';
    const environment = props?.environment ?? 'dev';
    const naming = new ParameterNaming(appName, this.account, environment);
    const resourceConfigs = ParameterNaming.getResourceConfigs();

    // Create parameters dynamically
    Object.entries(resourceConfigs).forEach(([key, config]) => {
      const parameterName = naming.generateParameterName(config.resourceType, config.resourceName);
      const parameter = new ssm.StringParameter(this, key.charAt(0).toUpperCase() + key.slice(1), {
        parameterName,
        stringValue: config.defaultValue,
        description: config.description
      });
      
      // Assign to specific properties
      if (key === 'instanceVolumeSize') this.instanceVolumeSize = parameter;
      else if (key === 'repositoryOwner') this.repositoryOwner = parameter;
      else if (key === 'repositoryName') this.repositoryName = parameter;
      else if (key === 'repositoryRef') this.repositoryRef = parameter;
      else if (key === 'codeServerVersion') this.codeServerVersion = parameter;
      else if (key === 'vpcCidr') this.vpcCidr = parameter;
      else if (key === 'instanceType') this.instanceType = parameter;
    });

    // Outputs for cross-stack reference
    new cdk.CfnOutput(this, 'InstanceVolumeSizeParam', {
      value: this.instanceVolumeSize.parameterName,
      exportName: 'EksWorkshop-InstanceVolumeSize-Param'
    });

    new cdk.CfnOutput(this, 'RepositoryOwnerParam', {
      value: this.repositoryOwner.parameterName,
      exportName: 'EksWorkshop-RepositoryOwner-Param'
    });

    new cdk.CfnOutput(this, 'RepositoryNameParam', {
      value: this.repositoryName.parameterName,
      exportName: 'EksWorkshop-RepositoryName-Param'
    });

    new cdk.CfnOutput(this, 'RepositoryRefParam', {
      value: this.repositoryRef.parameterName,
      exportName: 'EksWorkshop-RepositoryRef-Param'
    });

    new cdk.CfnOutput(this, 'CodeServerVersionParam', {
      value: this.codeServerVersion.parameterName,
      exportName: 'EksWorkshop-CodeServerVersion-Param'
    });

    new cdk.CfnOutput(this, 'VpcCidrParam', {
      value: this.vpcCidr.parameterName,
      exportName: 'EksWorkshop-VpcCidr-Param'
    });

    new cdk.CfnOutput(this, 'InstanceTypeParam', {
      value: this.instanceType.parameterName,
      exportName: 'EksWorkshop-InstanceType-Param'
    });
  }
}
import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { ParameterNaming } from './parameter-naming';

export interface ConfigStackProps extends cdk.StackProps {
  appName?: string;
  environment?: string;
}

export class ConfigStack extends cdk.Stack {
  private parameters: { [key: string]: ssm.StringParameter } = {};

  public get instanceVolumeSize(): ssm.StringParameter { return this.parameters['instanceVolumeSize']; }
  public get repositoryOwner(): ssm.StringParameter { return this.parameters['repositoryOwner']; }
  public get repositoryName(): ssm.StringParameter { return this.parameters['repositoryName']; }
  public get repositoryRef(): ssm.StringParameter { return this.parameters['repositoryRef']; }
  public get codeServerVersion(): ssm.StringParameter { return this.parameters['codeServerVersion']; }
  public get vpcCidr(): ssm.StringParameter { return this.parameters['vpcCidr']; }
  public get instanceType(): ssm.StringParameter { return this.parameters['instanceType']; }

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
      
      // Store in parameters map
      this.parameters[key] = parameter;
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
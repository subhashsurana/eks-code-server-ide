import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { ConfigStack } from './config-stack';
import { ParameterNaming } from './parameter-naming';

export interface ConfigProviderProps {
  configStack: ConfigStack;
}

export class ConfigProvider {
  static getFromSSM(scope: Construct, parameterName: string, defaultValue?: string): string {
    try {
      const param = ssm.StringParameter.fromStringParameterName(scope, `Param-${parameterName.replace(/[^a-zA-Z0-9]/g, '')}`, parameterName);
      return param.stringValue;
    } catch {
      return defaultValue || '';
    }
  }

  static getConfig(scope: Construct, props: ConfigProviderProps) {
    return {
      instanceVolumeSize: parseInt(props.configStack.instanceVolumeSize.stringValue),
      repositoryOwner: props.configStack.repositoryOwner.stringValue,
      repositoryName: props.configStack.repositoryName.stringValue,
      repositoryRef: props.configStack.repositoryRef.stringValue,
      codeServerVersion: props.configStack.codeServerVersion.stringValue,
      vpcCidr: props.configStack.vpcCidr.stringValue,
      instanceType: props.configStack.instanceType.stringValue
    };
  }

  static getConfigFromSSM(scope: Construct) {
    const account = cdk.Stack.of(scope).account;
    const appName = 'code-server-ide';
    const environment = 'dev';
    const naming = new ParameterNaming(appName, account, environment);
    const resourceConfigs = ParameterNaming.getResourceConfigs();

    const config: any = {};
    Object.entries(resourceConfigs).forEach(([key, resourceConfig]) => {
      const parameterName = naming.generateParameterName(resourceConfig.resourceType, resourceConfig.resourceName);
      // Use valueFromLookup for synth-time resolution with fallback
      try {
        const value = ssm.StringParameter.valueFromLookup(scope, parameterName);
        if (key === 'instanceVolumeSize') {
          config.instanceVolumeSize = parseInt(value || resourceConfig.defaultValue);
        } else {
          config[key as keyof typeof config] = value || resourceConfig.defaultValue;
        }
      } catch {
        // Fallback to default value if parameter doesn't exist
        const defaultValue = resourceConfig.defaultValue;
        if (key === 'instanceVolumeSize') {
          config.instanceVolumeSize = parseInt(defaultValue);
        } else {
          config[key as keyof typeof config] = defaultValue;
        }
      }
    });

    return config;
  }

  static createParameter(scope: Construct, id: string, resourceType: string, resourceName: string, value: string): ssm.StringParameter {
    const account = cdk.Stack.of(scope).account;
    const appName = 'code-server-ide';
    const environment = 'dev';
    const naming = new ParameterNaming(appName, account, environment);
    
    return new ssm.StringParameter(scope, id, {
      parameterName: naming.generateParameterName(resourceType, resourceName),
      stringValue: value,
      description: `${resourceType}/${resourceName} for code-server IDE`
    });
  }

  static getParameterName(resourceType: string, resourceName: string): string {
    // This should be called from within a stack context
    const appName = 'code-server-ide';
    const environment = 'dev';
    // Account will be resolved at runtime
    return `/${appName}/ACCOUNT_ID/${environment}/${resourceType}/${resourceName}`;
  }
}
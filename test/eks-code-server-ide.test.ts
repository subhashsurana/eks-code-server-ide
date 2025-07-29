import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { EksCodeServerIdeStack } from '../lib/eks-code-server-ide-stack';
import { ConfigStack } from '../lib/config-stack';
import { AutoShutdown } from '../lib/auto-shutdown';
import { ParameterNaming } from '../lib/parameter-naming';
import { TEST_CONSTANTS } from './test-constants';

describe('ConfigStack', () => {
  let app: cdk.App;
  let configStack: ConfigStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    configStack = new ConfigStack(app, 'TestConfigStack', {
      env: { account: TEST_CONSTANTS.ACCOUNT, region: TEST_CONSTANTS.REGIONS.US_EAST_1 },
      appName: TEST_CONSTANTS.APP_NAME,
      environment: TEST_CONSTANTS.ENVIRONMENT
    });
    template = Template.fromStack(configStack);
  });

  test('SSM parameters are created with correct naming convention', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: TEST_CONSTANTS.SSM_PARAMETERS.INSTANCE_VOLUME_SIZE,
      Value: '30',
      Type: 'String'
    });

    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: TEST_CONSTANTS.SSM_PARAMETERS.REPOSITORY_OWNER,
      Value: 'aws-samples',
      Type: 'String'
    });

    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: TEST_CONSTANTS.SSM_PARAMETERS.CODE_SERVER_VERSION,
      Value: TEST_CONSTANTS.CODE_SERVER.VERSION,
      Type: 'String'
    });
  });

  test('All required SSM parameters are created', () => {
    const resourceConfigs = ParameterNaming.getResourceConfigs();
    const expectedCount = Object.keys(resourceConfigs).length;
    
    template.resourceCountIs('AWS::SSM::Parameter', expectedCount);
  });

  test('Stack outputs are created for cross-stack reference', () => {
    template.hasOutput('InstanceVolumeSizeParam', {
      Value: {
        Ref: Match.stringLikeRegexp('InstanceVolumeSize.*')
      },
      Export: {
        Name: 'EksWorkshop-InstanceVolumeSize-Param'
      }
    });

    template.hasOutput('CodeServerVersionParam', {
      Value: {
        Ref: Match.stringLikeRegexp('CodeServerVersion.*')
      },
      Export: {
        Name: 'EksWorkshop-CodeServerVersion-Param'
      }
    });
  });
});

describe('EksCodeServerIdeStack', () => {
  let app: cdk.App;
  let configStack: ConfigStack;
  let stack: EksCodeServerIdeStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    configStack = new ConfigStack(app, 'TestConfigStack', {
      env: { account: TEST_CONSTANTS.ACCOUNT, region: TEST_CONSTANTS.REGIONS.US_EAST_1 },
      appName: TEST_CONSTANTS.APP_NAME,
      environment: TEST_CONSTANTS.ENVIRONMENT
    });
    stack = new EksCodeServerIdeStack(app, 'TestStack', {
      env: { account: TEST_CONSTANTS.ACCOUNT, region: TEST_CONSTANTS.REGIONS.US_EAST_1 },
      appName: TEST_CONSTANTS.APP_NAME,
      parameterEnvironment: TEST_CONSTANTS.ENVIRONMENT
    });
    template = Template.fromStack(stack);
  });

  test('VPC is created with correct CIDR', () => {
    template.hasResourceProperties('AWS::EC2::VPC', {
      CidrBlock: TEST_CONSTANTS.VPC.CIDR,
      EnableDnsHostnames: true,
      EnableDnsSupport: true
    });
  });

  test('EC2 instance is created with correct properties', () => {
    template.hasResourceProperties('AWS::EC2::Instance', {
      InstanceType: TEST_CONSTANTS.INSTANCE.TYPE,
      BlockDeviceMappings: [{
        DeviceName: '/dev/xvda',
        Ebs: {
          VolumeSize: TEST_CONSTANTS.INSTANCE.VOLUME_SIZE,
          VolumeType: TEST_CONSTANTS.INSTANCE.VOLUME_TYPE,
          DeleteOnTermination: true,
          Encrypted: true
        }
      }]
    });
  });

  test('Security group allows CloudFront access', () => {
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: 'SG for IDE'
    });
    
    template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: 'tcp',
      FromPort: 80,
      ToPort: 80,
      SourcePrefixListId: TEST_CONSTANTS.CLOUDFRONT_PREFIX_LISTS['us-east-1']
    });
  });

  test('Secrets Manager secret is created', () => {
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      GenerateSecretString: {
        ExcludeCharacters: TEST_CONSTANTS.SECRET.EXCLUDE_CHARS,
        ExcludePunctuation: true,
        GenerateStringKey: 'password',
        IncludeSpace: false,
        PasswordLength: TEST_CONSTANTS.SECRET.PASSWORD_LENGTH
      }
    });
  });

  test('CloudFront distribution is created', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        Enabled: true,
        HttpVersion: 'http2'
      }
    });
  });

  test('Lambda function is created for bootstrapping', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: TEST_CONSTANTS.LAMBDA.RUNTIME,
      Handler: TEST_CONSTANTS.LAMBDA.HANDLER,
      Timeout: TEST_CONSTANTS.LAMBDA.TIMEOUT,
      MemorySize: TEST_CONSTANTS.LAMBDA.MEMORY_SIZE
    });
  });

  test('SSM document is created', () => {
    template.hasResourceProperties('AWS::SSM::Document', {
      DocumentType: 'Command',
      DocumentFormat: 'YAML'
    });
  });

  test('IAM roles are created with correct policies', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([{
          Effect: 'Allow',
          Principal: {
            Service: 'ec2.amazonaws.com'
          },
          Action: 'sts:AssumeRole'
        }])
      }
    });
  });

  test('Custom resource is created', () => {
    template.hasResourceProperties('AWS::CloudFormation::CustomResource', {
      ServiceToken: Match.anyValue()
    });
  });

  test('Outputs are defined', () => {
    template.hasOutput('IdeUrl', {});
    template.hasOutput('IdePasswordSecret', {});
    template.hasOutput('IdePasswordSecretName', {});
    template.hasOutput('IdeRole', {});
  });

  test('Stack with custom parameters', () => {
    const customApp = new cdk.App();
    const customConfigStack = new ConfigStack(customApp, 'CustomConfigStack', {
      env: { account: TEST_CONSTANTS.ACCOUNT, region: TEST_CONSTANTS.REGIONS.US_WEST_2 },
      appName: 'custom-app',
      environment: 'prod'
    });
    const customStack = new EksCodeServerIdeStack(customApp, 'CustomStack', {
      env: { account: TEST_CONSTANTS.ACCOUNT, region: TEST_CONSTANTS.REGIONS.US_WEST_2 },
      appName: 'custom-app',
      parameterEnvironment: 'prod',
      instanceVolumeSize: 50
    });
    const customTemplate = Template.fromStack(customStack);

    customTemplate.hasResourceProperties('AWS::EC2::Instance', {
      BlockDeviceMappings: [{
        Ebs: {
          VolumeSize: 50
        }
      }]
    });
  });
});

describe('ParameterNaming', () => {
  test('generates correct parameter names', () => {
    const naming = new ParameterNaming('test-app', '123456789012', 'dev');
    const parameterName = naming.generateParameterName('compute', 'instance-type');
    
    expect(parameterName).toBe('/test-app/123456789012/dev/compute/instance-type');
  });

  test('resource configs have required properties', () => {
    const configs = ParameterNaming.getResourceConfigs();
    
    Object.entries(configs).forEach(([key, config]) => {
      expect(config).toHaveProperty('resourceType');
      expect(config).toHaveProperty('resourceName');
      expect(config).toHaveProperty('defaultValue');
      expect(config).toHaveProperty('description');
      expect(typeof config.resourceType).toBe('string');
      expect(typeof config.resourceName).toBe('string');
      expect(typeof config.defaultValue).toBe('string');
      expect(typeof config.description).toBe('string');
    });
  });

  test('resource configs contain expected keys', () => {
    const configs = ParameterNaming.getResourceConfigs();
    const expectedKeys = [
      'instanceVolumeSize', 'repositoryOwner', 'repositoryName',
      'repositoryRef', 'codeServerVersion', 'vpcCidr', 'instanceType'
    ];
    
    expectedKeys.forEach(key => {
      expect(configs).toHaveProperty(key);
    });
  });
});

describe('AutoShutdown', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack');
    new AutoShutdown(stack, 'TestAutoShutdown', {
      instanceId: 'i-1234567890abcdef0'
    });
    template = Template.fromStack(stack);
  });

  test('Lambda function uses external handler', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: TEST_CONSTANTS.AUTO_SHUTDOWN_LAMBDA.RUNTIME,
      Handler: TEST_CONSTANTS.AUTO_SHUTDOWN_LAMBDA.HANDLER,
      Timeout: TEST_CONSTANTS.AUTO_SHUTDOWN_LAMBDA.TIMEOUT
    });
  });

  test('EventBridge rule is created with correct schedule', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: 'rate(15 minutes)',
      State: 'ENABLED'
    });
  });

  test('Lambda has required IAM permissions', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([{
          Effect: 'Allow',
          Action: [
            'ec2:StopInstances',
            'ec2:DescribeInstances',
            'cloudwatch:GetMetricStatistics'
          ],
          Resource: '*'
        }])
      }
    });
  });

  test('Lambda environment variables are set correctly', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: {
          INSTANCE_ID: 'i-1234567890abcdef0',
          IDLE_TIMEOUT_MINUTES: '30'
        }
      }
    });
  });

  test('Custom idle timeout is respected', () => {
    const customApp = new cdk.App();
    const customStack = new cdk.Stack(customApp, 'CustomStack');
    new AutoShutdown(customStack, 'CustomAutoShutdown', {
      instanceId: 'i-1234567890abcdef0',
      idleTimeoutMinutes: 60
    });
    const customTemplate = Template.fromStack(customStack);

    customTemplate.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: {
          IDLE_TIMEOUT_MINUTES: '60'
        }
      }
    });
  });
});
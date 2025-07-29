#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { EksCodeServerIdeStack } from '../lib/eks-code-server-ide-stack';
import { ConfigStack } from '../lib/config-stack';
import { ParameterNaming } from '../lib/parameter-naming';

function validateStack() {
  console.log('🔍 Validating CDK stack configuration...\n');

  try {
    const app = new cdk.App();
    
    console.log('✅ Testing ConfigStack...');
    const configStack = new ConfigStack(app, 'ValidationConfigStack', {
      env: { account: '123456789012', region: 'us-east-1' },
      appName: 'code-server-ide',
      environment: 'dev'
    });

    console.log('✅ Testing EksCodeServerIdeStack...');
    const mainStack = new EksCodeServerIdeStack(app, 'ValidationMainStack', {
      env: { account: '123456789012', region: 'us-east-1' },
      appName: 'code-server-ide',
      parameterEnvironment: 'dev'
    });

    console.log('✅ Testing parameter naming utility...');
    const naming = new ParameterNaming('test-app', '123456789012', 'prod');
    const sampleParam = naming.generateParameterName('compute', 'instance-type');
    console.log(`   Sample parameter: ${sampleParam}`);

    console.log('✅ Testing resource configurations...');
    const resourceConfigs = ParameterNaming.getResourceConfigs();
    console.log(`   Resource configs count: ${Object.keys(resourceConfigs).length}`);
    
    Object.entries(resourceConfigs).forEach(([key, config]) => {
      console.log(`   - ${key}: ${config.resourceType}/${config.resourceName}`);
    });

    console.log('✅ Synthesizing CloudFormation templates...');
    const assembly = app.synth();
    
    console.log('\n🎉 Validation completed successfully!');
    console.log(`📁 Generated ${assembly.stacks.length} stack(s):`);
    
    assembly.stacks.forEach(stack => {
      console.log(`   - ${stack.stackName}`);
      console.log(`     Template size: ${JSON.stringify(stack.template).length} bytes`);
      
      // Count SSM parameters in config stack
      if (stack.stackName.includes('Config')) {
        const ssmParams = Object.values(stack.template.Resources || {})
          .filter((resource: any) => resource.Type === 'AWS::SSM::Parameter');
        console.log(`     SSM Parameters: ${ssmParams.length}`);
      }
    });

  } catch (error) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  }
}

validateStack();
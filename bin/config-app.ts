#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ConfigStack } from '../lib/config-stack';

const app = new cdk.App();

// Create config stack only
new ConfigStack(app, 'EksWorkshopConfigStack', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  },
  appName: 'code-server-ide',
  environment: process.env.ENVIRONMENT || 'dev'
});
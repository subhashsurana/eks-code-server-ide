#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { EksCodeServerIdeStack } from '../lib/eks-code-server-ide-stack';

const app = new cdk.App();

// Create main stack only (ConfigStack deployed separately)
new EksCodeServerIdeStack(app, 'EksCodeServerIdeStackV2', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  }
});
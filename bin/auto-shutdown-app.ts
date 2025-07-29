#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AutoShutdownStack } from '../lib/auto-shutdown-stack';

const app = new cdk.App();

new AutoShutdownStack(app, 'EksCodeServerIdeAutoShutdownStack', {
  idleTimeoutMinutes: 30,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
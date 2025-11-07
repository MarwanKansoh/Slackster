#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SlacksterStack } from './cdk-stack';

const app = new cdk.App();
new SlacksterStack(app, 'SlacksterStack', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1' 
  },
  description: 'Slackster - Organizational LLM Chatbot with Slack integration'
});
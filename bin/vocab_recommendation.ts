#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { VocabRecommendationStack } from '../lib/vocab_recommendation-stack';

const app = new cdk.App();

// Get environment from environment variables or use defaults
const account = process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID;
const region = process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-1';

new VocabRecommendationStack(app, 'VocabRecommendationStack', {
  env: account && region
    ? { account, region }
    : undefined, // Will use default from AWS CLI config if not specified
  description: 'Vocabulary Essay Analyzer PoC - Serverless infrastructure for essay analysis',
});

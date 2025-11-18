#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const cdk = __importStar(require("aws-cdk-lib"));
const vocab_recommendation_stack_1 = require("../lib/vocab_recommendation-stack");
const app = new cdk.App();
// Get environment from environment variables or use defaults
const account = process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID;
const region = process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-1';
new vocab_recommendation_stack_1.VocabRecommendationStack(app, 'VincentVocabRecommendationStack', {
    env: account && region
        ? { account, region }
        : undefined, // Will use default from AWS CLI config if not specified
    description: 'Vocabulary Essay Analyzer - Serverless teaching platform for essay vocabulary analysis with OpenAI GPT-4.1-mini',
    tags: {
        Project: 'vocab-recommendation',
        Environment: process.env.ENVIRONMENT || 'production',
        ManagedBy: 'CDK',
    },
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidm9jYWJfcmVjb21tZW5kYXRpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2b2NhYl9yZWNvbW1lbmRhdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBLGlEQUFtQztBQUNuQyxrRkFBNkU7QUFFN0UsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7QUFFMUIsNkRBQTZEO0FBQzdELE1BQU0sT0FBTyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUM7QUFDOUUsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxXQUFXLENBQUM7QUFFdkYsSUFBSSxxREFBd0IsQ0FBQyxHQUFHLEVBQUUsaUNBQWlDLEVBQUU7SUFDbkUsR0FBRyxFQUFFLE9BQU8sSUFBSSxNQUFNO1FBQ3BCLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUU7UUFDckIsQ0FBQyxDQUFDLFNBQVMsRUFBRSx3REFBd0Q7SUFDdkUsV0FBVyxFQUFFLGlIQUFpSDtJQUM5SCxJQUFJLEVBQUU7UUFDSixPQUFPLEVBQUUsc0JBQXNCO1FBQy9CLFdBQVcsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsSUFBSSxZQUFZO1FBQ3BELFNBQVMsRUFBRSxLQUFLO0tBQ2pCO0NBQ0YsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IFZvY2FiUmVjb21tZW5kYXRpb25TdGFjayB9IGZyb20gJy4uL2xpYi92b2NhYl9yZWNvbW1lbmRhdGlvbi1zdGFjayc7XG5cbmNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XG5cbi8vIEdldCBlbnZpcm9ubWVudCBmcm9tIGVudmlyb25tZW50IHZhcmlhYmxlcyBvciB1c2UgZGVmYXVsdHNcbmNvbnN0IGFjY291bnQgPSBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5UIHx8IHByb2Nlc3MuZW52LkFXU19BQ0NPVU5UX0lEO1xuY29uc3QgcmVnaW9uID0gcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfUkVHSU9OIHx8IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMSc7XG5cbm5ldyBWb2NhYlJlY29tbWVuZGF0aW9uU3RhY2soYXBwLCAnVmluY2VudFZvY2FiUmVjb21tZW5kYXRpb25TdGFjaycsIHtcbiAgZW52OiBhY2NvdW50ICYmIHJlZ2lvblxuICAgID8geyBhY2NvdW50LCByZWdpb24gfVxuICAgIDogdW5kZWZpbmVkLCAvLyBXaWxsIHVzZSBkZWZhdWx0IGZyb20gQVdTIENMSSBjb25maWcgaWYgbm90IHNwZWNpZmllZFxuICBkZXNjcmlwdGlvbjogJ1ZvY2FidWxhcnkgRXNzYXkgQW5hbHl6ZXIgLSBTZXJ2ZXJsZXNzIHRlYWNoaW5nIHBsYXRmb3JtIGZvciBlc3NheSB2b2NhYnVsYXJ5IGFuYWx5c2lzIHdpdGggT3BlbkFJIEdQVC00LjEtbWluaScsXG4gIHRhZ3M6IHtcbiAgICBQcm9qZWN0OiAndm9jYWItcmVjb21tZW5kYXRpb24nLFxuICAgIEVudmlyb25tZW50OiBwcm9jZXNzLmVudi5FTlZJUk9OTUVOVCB8fCAncHJvZHVjdGlvbicsXG4gICAgTWFuYWdlZEJ5OiAnQ0RLJyxcbiAgfSxcbn0pO1xuIl19
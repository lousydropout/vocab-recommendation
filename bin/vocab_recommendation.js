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
    description: 'Vocabulary Essay Analyzer PoC - Serverless infrastructure for essay analysis',
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidm9jYWJfcmVjb21tZW5kYXRpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2b2NhYl9yZWNvbW1lbmRhdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBLGlEQUFtQztBQUNuQyxrRkFBNkU7QUFFN0UsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7QUFFMUIsNkRBQTZEO0FBQzdELE1BQU0sT0FBTyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUM7QUFDOUUsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxXQUFXLENBQUM7QUFFdkYsSUFBSSxxREFBd0IsQ0FBQyxHQUFHLEVBQUUsaUNBQWlDLEVBQUU7SUFDbkUsR0FBRyxFQUFFLE9BQU8sSUFBSSxNQUFNO1FBQ3BCLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUU7UUFDckIsQ0FBQyxDQUFDLFNBQVMsRUFBRSx3REFBd0Q7SUFDdkUsV0FBVyxFQUFFLDhFQUE4RTtDQUM1RixDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiBub2RlXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgVm9jYWJSZWNvbW1lbmRhdGlvblN0YWNrIH0gZnJvbSAnLi4vbGliL3ZvY2FiX3JlY29tbWVuZGF0aW9uLXN0YWNrJztcblxuY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcblxuLy8gR2V0IGVudmlyb25tZW50IGZyb20gZW52aXJvbm1lbnQgdmFyaWFibGVzIG9yIHVzZSBkZWZhdWx0c1xuY29uc3QgYWNjb3VudCA9IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlQgfHwgcHJvY2Vzcy5lbnYuQVdTX0FDQ09VTlRfSUQ7XG5jb25zdCByZWdpb24gPSBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9SRUdJT04gfHwgcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCAndXMtZWFzdC0xJztcblxubmV3IFZvY2FiUmVjb21tZW5kYXRpb25TdGFjayhhcHAsICdWaW5jZW50Vm9jYWJSZWNvbW1lbmRhdGlvblN0YWNrJywge1xuICBlbnY6IGFjY291bnQgJiYgcmVnaW9uXG4gICAgPyB7IGFjY291bnQsIHJlZ2lvbiB9XG4gICAgOiB1bmRlZmluZWQsIC8vIFdpbGwgdXNlIGRlZmF1bHQgZnJvbSBBV1MgQ0xJIGNvbmZpZyBpZiBub3Qgc3BlY2lmaWVkXG4gIGRlc2NyaXB0aW9uOiAnVm9jYWJ1bGFyeSBFc3NheSBBbmFseXplciBQb0MgLSBTZXJ2ZXJsZXNzIGluZnJhc3RydWN0dXJlIGZvciBlc3NheSBhbmFseXNpcycsXG59KTtcbiJdfQ==
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
const assertions_1 = require("aws-cdk-lib/assertions");
const vocab_recommendation_stack_1 = require("../lib/vocab_recommendation-stack");
describe('VocabRecommendationStack', () => {
    let app;
    let stack;
    let template;
    beforeEach(() => {
        app = new cdk.App();
        stack = new vocab_recommendation_stack_1.VocabRecommendationStack(app, 'TestStack', {
            env: { account: '123456789012', region: 'us-east-1' },
        });
        template = assertions_1.Template.fromStack(stack);
    });
    describe('S3 Bucket', () => {
        test('should create EssaysBucket with correct properties', () => {
            template.hasResourceProperties('AWS::S3::Bucket', {
                BucketName: 'vocab-essays-123456789012-us-east-1',
                PublicAccessBlockConfiguration: {
                    BlockPublicAcls: true,
                    BlockPublicPolicy: true,
                    IgnorePublicAcls: true,
                    RestrictPublicBuckets: true,
                },
                BucketEncryption: {
                    ServerSideEncryptionConfiguration: [
                        {
                            ServerSideEncryptionByDefault: {
                                SSEAlgorithm: 'AES256',
                            },
                        },
                    ],
                },
            });
        });
        test('should have auto-delete objects custom resource', () => {
            template.hasResourceProperties('Custom::S3AutoDeleteObjects', {
                ServiceToken: assertions_1.Match.anyValue(),
                BucketName: assertions_1.Match.anyValue(),
            });
        });
        test('should have CORS configuration', () => {
            template.hasResourceProperties('AWS::S3::Bucket', {
                CorsConfiguration: {
                    CorsRules: [
                        {
                            AllowedOrigins: ['*'],
                            AllowedMethods: ['GET', 'PUT', 'POST'],
                            AllowedHeaders: ['*'],
                            MaxAge: 3600,
                        },
                    ],
                },
            });
        });
    });
    describe('DynamoDB Table', () => {
        test('should create EssayMetrics table with correct schema', () => {
            template.hasResourceProperties('AWS::DynamoDB::Table', {
                TableName: 'EssayMetrics',
                KeySchema: [
                    {
                        AttributeName: 'essay_id',
                        KeyType: 'HASH',
                    },
                ],
                AttributeDefinitions: [
                    {
                        AttributeName: 'essay_id',
                        AttributeType: 'S',
                    },
                ],
                BillingMode: 'PAY_PER_REQUEST',
                SSESpecification: {
                    SSEEnabled: true,
                },
            });
        });
        test('should have point-in-time recovery disabled', () => {
            template.hasResourceProperties('AWS::DynamoDB::Table', {
                PointInTimeRecoverySpecification: {
                    PointInTimeRecoveryEnabled: false,
                },
            });
        });
    });
    describe('SQS Queues', () => {
        test('should create ProcessingDLQ with correct properties', () => {
            template.hasResourceProperties('AWS::SQS::Queue', {
                QueueName: 'essay-processing-dlq',
                MessageRetentionPeriod: 1209600, // 14 days in seconds
                SqsManagedSseEnabled: true,
            });
        });
        test('should create EssayProcessingQueue with correct properties', () => {
            template.hasResourceProperties('AWS::SQS::Queue', {
                QueueName: 'essay-processing-queue',
                VisibilityTimeout: 300, // 5 minutes
                MessageRetentionPeriod: 1209600, // 14 days
                RedrivePolicy: {
                    deadLetterTargetArn: assertions_1.Match.anyValue(),
                    maxReceiveCount: 3,
                },
                SqsManagedSseEnabled: true,
            });
        });
    });
    describe('IAM Roles', () => {
        test('should create ApiLambdaRole with correct trust policy', () => {
            template.hasResourceProperties('AWS::IAM::Role', {
                AssumeRolePolicyDocument: {
                    Statement: [
                        {
                            Effect: 'Allow',
                            Principal: {
                                Service: 'lambda.amazonaws.com',
                            },
                            Action: 'sts:AssumeRole',
                        },
                    ],
                },
                ManagedPolicyArns: [
                    {
                        'Fn::Join': [
                            '',
                            [
                                'arn:',
                                { Ref: 'AWS::Partition' },
                                ':iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
                            ],
                        ],
                    },
                ],
            });
        });
        test('should create S3UploadLambdaRole', () => {
            template.hasResourceProperties('AWS::IAM::Role', {
                Description: 'IAM role for S3 upload trigger Lambda function',
            });
        });
        test('should create ProcessorLambdaRole', () => {
            template.hasResourceProperties('AWS::IAM::Role', {
                Description: 'IAM role for essay processor Lambda function',
            });
        });
        test('ApiLambdaRole should have S3 read/write permissions', () => {
            template.hasResourceProperties('AWS::IAM::Policy', {
                PolicyDocument: {
                    Statement: assertions_1.Match.arrayWith([
                        assertions_1.Match.objectLike({
                            Effect: 'Allow',
                            Action: assertions_1.Match.arrayWith(['s3:GetObject*', 's3:PutObject']),
                            Resource: assertions_1.Match.anyValue(),
                        }),
                    ]),
                },
                Roles: [assertions_1.Match.anyValue()],
            });
        });
        test('ApiLambdaRole should have DynamoDB read/write permissions', () => {
            // Check that the policy contains DynamoDB permissions
            template.hasResourceProperties('AWS::IAM::Policy', {
                PolicyDocument: {
                    Statement: assertions_1.Match.arrayWith([
                        assertions_1.Match.objectLike({
                            Effect: 'Allow',
                            Action: assertions_1.Match.arrayWith([
                                assertions_1.Match.stringLikeRegexp('dynamodb:PutItem'),
                            ]),
                        }),
                    ]),
                },
                PolicyName: assertions_1.Match.stringLikeRegexp('.*ApiLambdaRole.*'),
            });
        });
        test('ApiLambdaRole should have SQS send permissions', () => {
            template.hasResourceProperties('AWS::IAM::Policy', {
                PolicyDocument: {
                    Statement: assertions_1.Match.arrayWith([
                        assertions_1.Match.objectLike({
                            Effect: 'Allow',
                            Action: assertions_1.Match.arrayWith(['sqs:SendMessage']),
                            Resource: assertions_1.Match.anyValue(),
                        }),
                    ]),
                },
                PolicyName: assertions_1.Match.stringLikeRegexp('.*ApiLambdaRole.*'),
            });
        });
        test('ProcessorLambdaRole should have Bedrock invoke permissions', () => {
            template.hasResourceProperties('AWS::IAM::Policy', {
                PolicyDocument: {
                    Statement: assertions_1.Match.arrayWith([
                        assertions_1.Match.objectLike({
                            Effect: 'Allow',
                            Action: 'bedrock:InvokeModel',
                            Resource: assertions_1.Match.arrayWith([
                                assertions_1.Match.stringLikeRegexp('.*anthropic.claude-3-sonnet-.*'),
                                assertions_1.Match.stringLikeRegexp('.*anthropic.claude-3-haiku-.*'),
                                assertions_1.Match.stringLikeRegexp('.*anthropic.claude-3-opus-.*'),
                            ]),
                        }),
                    ]),
                },
                Roles: [assertions_1.Match.anyValue()],
            });
        });
        test('ProcessorLambdaRole should have SQS consume permissions', () => {
            // Check that the policy contains SQS consume permissions
            template.hasResourceProperties('AWS::IAM::Policy', {
                PolicyDocument: {
                    Statement: assertions_1.Match.arrayWith([
                        assertions_1.Match.objectLike({
                            Effect: 'Allow',
                            Action: assertions_1.Match.arrayWith([
                                assertions_1.Match.stringLikeRegexp('sqs:ReceiveMessage'),
                            ]),
                        }),
                    ]),
                },
                PolicyName: assertions_1.Match.stringLikeRegexp('.*ProcessorLambdaRole.*'),
            });
        });
    });
    describe('CloudFormation Outputs', () => {
        test('should export EssaysBucketName', () => {
            template.hasOutput('EssaysBucketName', {
                Value: assertions_1.Match.anyValue(),
                Export: {
                    Name: 'EssaysBucketName',
                },
            });
        });
        test('should export ProcessingQueueUrl', () => {
            template.hasOutput('ProcessingQueueUrl', {
                Export: {
                    Name: 'ProcessingQueueUrl',
                },
            });
        });
        test('should export MetricsTableName', () => {
            template.hasOutput('MetricsTableName', {
                Value: assertions_1.Match.anyValue(),
                Export: {
                    Name: 'MetricsTableName',
                },
            });
        });
        test('should export ApiLambdaRoleArn', () => {
            template.hasOutput('ApiLambdaRoleArn', {
                Export: {
                    Name: 'ApiLambdaRoleArn',
                },
            });
        });
        test('should export S3UploadLambdaRoleArn', () => {
            template.hasOutput('S3UploadLambdaRoleArn', {
                Export: {
                    Name: 'S3UploadLambdaRoleArn',
                },
            });
        });
        test('should export ProcessorLambdaRoleArn', () => {
            template.hasOutput('ProcessorLambdaRoleArn', {
                Export: {
                    Name: 'ProcessorLambdaRoleArn',
                },
            });
        });
        test('should export AlarmTopicArn', () => {
            template.hasOutput('AlarmTopicArn', {
                Export: {
                    Name: 'AlarmTopicArn',
                },
            });
        });
    });
    describe('CloudWatch Observability', () => {
        test('should create SNS topic for alarms', () => {
            template.hasResourceProperties('AWS::SNS::Topic', {
                DisplayName: 'Vocabulary Essay Analyzer Alarms',
            });
        });
        test('should create alarm for API Lambda errors', () => {
            template.hasResourceProperties('AWS::CloudWatch::Alarm', {
                AlarmName: 'vocab-analyzer-api-lambda-errors',
                AlarmDescription: 'Alerts when API Lambda errors exceed threshold',
            });
        });
        test('should create alarm for S3 Upload Lambda errors', () => {
            template.hasResourceProperties('AWS::CloudWatch::Alarm', {
                AlarmName: 'vocab-analyzer-s3-upload-lambda-errors',
                AlarmDescription: 'Alerts when S3 Upload Lambda errors exceed threshold',
            });
        });
        test('should create alarm for Processor Lambda errors', () => {
            template.hasResourceProperties('AWS::CloudWatch::Alarm', {
                AlarmName: 'vocab-analyzer-processor-lambda-errors',
                AlarmDescription: 'Alerts when Processor Lambda errors exceed threshold',
            });
        });
        test('should create alarm for DLQ messages', () => {
            template.hasResourceProperties('AWS::CloudWatch::Alarm', {
                AlarmName: 'vocab-analyzer-dlq-messages',
                AlarmDescription: 'Alerts when messages are sent to DLQ (processing failures)',
            });
        });
        test('should create alarm for Processor Lambda throttles', () => {
            template.hasResourceProperties('AWS::CloudWatch::Alarm', {
                AlarmName: 'vocab-analyzer-processor-lambda-throttles',
                AlarmDescription: 'Alerts when Processor Lambda is throttled',
            });
        });
        test('should create alarm for Processor Lambda duration', () => {
            template.hasResourceProperties('AWS::CloudWatch::Alarm', {
                AlarmName: 'vocab-analyzer-processor-lambda-duration',
                AlarmDescription: 'Alerts when Processor Lambda duration is high (approaching timeout)',
            });
        });
        test('should have at least 6 CloudWatch alarms', () => {
            // API Lambda errors, S3 Upload Lambda errors, Processor Lambda errors,
            // DLQ messages, Processor Lambda throttles, Processor Lambda duration
            const alarms = template.findResources('AWS::CloudWatch::Alarm');
            expect(Object.keys(alarms).length).toBeGreaterThanOrEqual(6);
        });
    });
    describe('Resource Counts', () => {
        test('should have exactly 1 S3 bucket', () => {
            template.resourceCountIs('AWS::S3::Bucket', 1);
        });
        test('should have exactly 2 SQS queues', () => {
            template.resourceCountIs('AWS::SQS::Queue', 2);
        });
        test('should have exactly 1 DynamoDB table', () => {
            template.resourceCountIs('AWS::DynamoDB::Table', 1);
        });
        test('should have at least 3 IAM roles for Lambdas', () => {
            // Should have at least: ApiLambda, S3UploadLambda, ProcessorLambda roles
            // Plus custom resource roles for S3 auto-delete and bucket notifications
            const roles = template.findResources('AWS::IAM::Role');
            expect(Object.keys(roles).length).toBeGreaterThanOrEqual(3);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidm9jYWJfcmVjb21tZW5kYXRpb24udGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInZvY2FiX3JlY29tbWVuZGF0aW9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQyx1REFBeUQ7QUFDekQsa0ZBQTZFO0FBRTdFLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSxHQUFHLEVBQUU7SUFDeEMsSUFBSSxHQUFZLENBQUM7SUFDakIsSUFBSSxLQUErQixDQUFDO0lBQ3BDLElBQUksUUFBa0IsQ0FBQztJQUV2QixVQUFVLENBQUMsR0FBRyxFQUFFO1FBQ2QsR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3BCLEtBQUssR0FBRyxJQUFJLHFEQUF3QixDQUFDLEdBQUcsRUFBRSxXQUFXLEVBQUU7WUFDckQsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFO1NBQ3RELENBQUMsQ0FBQztRQUNILFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUN2QyxDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyxXQUFXLEVBQUUsR0FBRyxFQUFFO1FBQ3pCLElBQUksQ0FBQyxvREFBb0QsRUFBRSxHQUFHLEVBQUU7WUFDOUQsUUFBUSxDQUFDLHFCQUFxQixDQUFDLGlCQUFpQixFQUFFO2dCQUNoRCxVQUFVLEVBQUUscUNBQXFDO2dCQUNqRCw4QkFBOEIsRUFBRTtvQkFDOUIsZUFBZSxFQUFFLElBQUk7b0JBQ3JCLGlCQUFpQixFQUFFLElBQUk7b0JBQ3ZCLGdCQUFnQixFQUFFLElBQUk7b0JBQ3RCLHFCQUFxQixFQUFFLElBQUk7aUJBQzVCO2dCQUNELGdCQUFnQixFQUFFO29CQUNoQixpQ0FBaUMsRUFBRTt3QkFDakM7NEJBQ0UsNkJBQTZCLEVBQUU7Z0NBQzdCLFlB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LENBQUMsaUJBQWlCLEVBQUUsR0FBRyxFQUFFO1FBQy9CLElBQUksQ0FBQyxpQ0FBaUMsRUFBRSxHQUFHLEVBQUU7WUFDM0MsUUFBUSxDQUFDLGVBQWUsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxrQ0FBa0MsRUFBRSxHQUFHLEVBQUU7WUFDNUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxzQ0FBc0MsRUFBRSxHQUFHLEVBQUU7WUFDaEQsUUFBUSxDQUFDLGVBQWUsQ0FBQyxzQkFBc0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN0RCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyw4Q0FBOEMsRUFBRSxHQUFHLEVBQUU7WUFDeEQseUVBQXlFO1lBQ3pFLHlFQUF5RTtZQUN6RSxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLGdCQUFnQixDQUFDLENBQUM7WUFDdkQsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDOUQsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IFRlbXBsYXRlLCBNYXRjaCB9IGZyb20gJ2F3cy1jZGstbGliL2Fzc2VydGlvbnMnO1xuaW1wb3J0IHsgVm9jYWJSZWNvbW1lbmRhdGlvblN0YWNrIH0gZnJvbSAnLi4vbGliL3ZvY2FiX3JlY29tbWVuZGF0aW9uLXN0YWNrJztcblxuZGVzY3JpYmUoJ1ZvY2FiUmVjb21tZW5kYXRpb25TdGFjaycsICgpID0+IHtcbiAgbGV0IGFwcDogY2RrLkFwcDtcbiAgbGV0IHN0YWNrOiBWb2NhYlJlY29tbWVuZGF0aW9uU3RhY2s7XG4gIGxldCB0ZW1wbGF0ZTogVGVtcGxhdGU7XG5cbiAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgYXBwID0gbmV3IGNkay5BcHAoKTtcbiAgICBzdGFjayA9IG5ldyBWb2NhYlJlY29tbWVuZGF0aW9uU3RhY2soYXBwLCAnVGVzdFN0YWNrJywge1xuICAgICAgZW52OiB7IGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLCByZWdpb246ICd1cy1lYXN0LTEnIH0sXG4gICAgfSk7XG4gICAgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spO1xuICB9KTtcblxuICBkZXNjcmliZSgnUzMgQnVja2V0JywgKCkgPT4ge1xuICAgIHRlc3QoJ3Nob3VsZCBjcmVhdGUgRXNzYXlzQnVja2V0IHdpdGggY29ycmVjdCBwcm9wZXJ0aWVzJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlMzOjpCdWNrZXQnLCB7XG4gICAgICAgIEJ1Y2tldE5hbWU6ICd2b2NhYi1lc3NheXMtMTIzNDU2Nzg5MDEyLXVzLWVhc3QtMScsXG4gICAgICAgIFB1YmxpY0FjY2Vzc0Jsb2NrQ29uZmlndXJhdGlvbjoge1xuICAgICAgICAgIEJsb2NrUHVibGljQWNsczogdHJ1ZSxcbiAgICAgICAgICBCbG9ja1B1YmxpY1BvbGljeTogdHJ1ZSxcbiAgICAgICAgICBJZ25vcmVQdWJsaWNBY2xzOiB0cnVlLFxuICAgICAgICAgIFJlc3RyaWN0UHVibGljQnVja2V0czogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgQnVja2V0RW5jcnlwdGlvbjoge1xuICAgICAgICAgIFNlcnZlclNpZGVFbmNyeXB0aW9uQ29uZmlndXJhdGlvbjogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBTZXJ2ZXJTaWRlRW5jcnlwdGlvbkJ5RGVmYXVsdDoge1xuICAgICAgICAgICAgICAgIFNTRUFsZ29yaXRobTogJ0FFUzI1NicsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ3Nob3VsZCBoYXZlIGF1dG8tZGVsZXRlIG9iamVjdHMgY3VzdG9tIHJlc291cmNlJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdDdXN0b206OlMzQXV0b0RlbGV0ZU9iamVjdHMnLCB7XG4gICAgICAgIFNlcnZpY2VUb2tlbjogTWF0Y2guYW55VmFsdWUoKSxcbiAgICAgICAgQnVja2V0TmFtZTogTWF0Y2guYW55VmFsdWUoKSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2hvdWxkIGhhdmUgQ09SUyBjb25maWd1cmF0aW9uJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlMzOjpCdWNrZXQnLCB7XG4gICAgICAgIENvcnNDb25maWd1cmF0aW9uOiB7XG4gICAgICAgICAgQ29yc1J1bGVzOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIEFsbG93ZWRPcmlnaW5zOiBbJyonXSxcbiAgICAgICAgICAgICAgQWxsb3dlZE1ldGhvZHM6IFsnR0VUJywgJ1BVVCcsICdQT1NUJ10sXG4gICAgICAgICAgICAgIEFsbG93ZWRIZWFkZXJzOiBbJyonXSxcbiAgICAgICAgICAgICAgTWF4QWdlOiAzNjAwLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdEeW5hbW9EQiBUYWJsZScsICgpID0+IHtcbiAgICB0ZXN0KCdzaG91bGQgY3JlYXRlIEVzc2F5TWV0cmljcyB0YWJsZSB3aXRoIGNvcnJlY3Qgc2NoZW1hJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkR5bmFtb0RCOjpUYWJsZScsIHtcbiAgICAgICAgVGFibGVOYW1lOiAnRXNzYXlNZXRyaWNzJyxcbiAgICAgICAgS2V5U2NoZW1hOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgQXR0cmlidXRlTmFtZTogJ2Vzc2F5X2lkJyxcbiAgICAgICAgICAgIEtleVR5cGU6ICdIQVNIJyxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgICBBdHRyaWJ1dGVEZWZpbml0aW9uczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIEF0dHJpYnV0ZU5hbWU6ICdlc3NheV9pZCcsXG4gICAgICAgICAgICBBdHRyaWJ1dGVUeXBlOiAnUycsXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgICAgQmlsbGluZ01vZGU6ICdQQVlfUEVSX1JFUVVFU1QnLFxuICAgICAgICBTU0VTcGVjaWZpY2F0aW9uOiB7XG4gICAgICAgICAgU1NFRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2hvdWxkIGhhdmUgcG9pbnQtaW4tdGltZSByZWNvdmVyeSBkaXNhYmxlZCcsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpEeW5hbW9EQjo6VGFibGUnLCB7XG4gICAgICAgIFBvaW50SW5UaW1lUmVjb3ZlcnlTcGVjaWZpY2F0aW9uOiB7XG4gICAgICAgICAgUG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IGZhbHNlLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdTUVMgUXVldWVzJywgKCkgPT4ge1xuICAgIHRlc3QoJ3Nob3VsZCBjcmVhdGUgUHJvY2Vzc2luZ0RMUSB3aXRoIGNvcnJlY3QgcHJvcGVydGllcycsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTUVM6OlF1ZXVlJywge1xuICAgICAgICBRdWV1ZU5hbWU6ICdlc3NheS1wcm9jZXNzaW5nLWRscScsXG4gICAgICAgIE1lc3NhZ2VSZXRlbnRpb25QZXJpb2Q6IDEyMDk2MDAsIC8vIDE0IGRheXMgaW4gc2Vjb25kc1xuICAgICAgICBTcXNNYW5hZ2VkU3NlRW5hYmxlZDogdHJ1ZSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2hvdWxkIGNyZWF0ZSBFc3NheVByb2Nlc3NpbmdRdWV1ZSB3aXRoIGNvcnJlY3QgcHJvcGVydGllcycsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTUVM6OlF1ZXVlJywge1xuICAgICAgICBRdWV1ZU5hbWU6ICdlc3NheS1wcm9jZXNzaW5nLXF1ZXVlJyxcbiAgICAgICAgVmlzaWJpbGl0eVRpbWVvdXQ6IDMwMCwgLy8gNSBtaW51dGVzXG4gICAgICAgIE1lc3NhZ2VSZXRlbnRpb25QZXJpb2Q6IDEyMDk2MDAsIC8vIDE0IGRheXNcbiAgICAgICAgUmVkcml2ZVBvbGljeToge1xuICAgICAgICAgIGRlYWRMZXR0ZXJUYXJnZXRBcm46IE1hdGNoLmFueVZhbHVlKCksXG4gICAgICAgICAgbWF4UmVjZWl2ZUNvdW50OiAzLFxuICAgICAgICB9LFxuICAgICAgICBTcXNNYW5hZ2VkU3NlRW5hYmxlZDogdHJ1ZSxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnSUFNIFJvbGVzJywgKCkgPT4ge1xuICAgIHRlc3QoJ3Nob3VsZCBjcmVhdGUgQXBpTGFtYmRhUm9sZSB3aXRoIGNvcnJlY3QgdHJ1c3QgcG9saWN5JywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OklBTTo6Um9sZScsIHtcbiAgICAgICAgQXNzdW1lUm9sZVBvbGljeURvY3VtZW50OiB7XG4gICAgICAgICAgU3RhdGVtZW50OiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIEVmZmVjdDogJ0FsbG93JyxcbiAgICAgICAgICAgICAgUHJpbmNpcGFsOiB7XG4gICAgICAgICAgICAgICAgU2VydmljZTogJ2xhbWJkYS5hbWF6b25hd3MuY29tJyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgQWN0aW9uOiAnc3RzOkFzc3VtZVJvbGUnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgICBNYW5hZ2VkUG9saWN5QXJuczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgICdGbjo6Sm9pbic6IFtcbiAgICAgICAgICAgICAgJycsXG4gICAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgICAnYXJuOicsXG4gICAgICAgICAgICAgICAgeyBSZWY6ICdBV1M6OlBhcnRpdGlvbicgfSxcbiAgICAgICAgICAgICAgICAnOmlhbTo6YXdzOnBvbGljeS9zZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2hvdWxkIGNyZWF0ZSBTM1VwbG9hZExhbWJkYVJvbGUnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6SUFNOjpSb2xlJywge1xuICAgICAgICBEZXNjcmlwdGlvbjogJ0lBTSByb2xlIGZvciBTMyB1cGxvYWQgdHJpZ2dlciBMYW1iZGEgZnVuY3Rpb24nLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzaG91bGQgY3JlYXRlIFByb2Nlc3NvckxhbWJkYVJvbGUnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6SUFNOjpSb2xlJywge1xuICAgICAgICBEZXNjcmlwdGlvbjogJ0lBTSByb2xlIGZvciBlc3NheSBwcm9jZXNzb3IgTGFtYmRhIGZ1bmN0aW9uJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnQXBpTGFtYmRhUm9sZSBzaG91bGQgaGF2ZSBTMyByZWFkL3dyaXRlIHBlcm1pc3Npb25zJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OklBTTo6UG9saWN5Jywge1xuICAgICAgICBQb2xpY3lEb2N1bWVudDoge1xuICAgICAgICAgIFN0YXRlbWVudDogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgICBFZmZlY3Q6ICdBbGxvdycsXG4gICAgICAgICAgICAgIEFjdGlvbjogTWF0Y2guYXJyYXlXaXRoKFsnczM6R2V0T2JqZWN0KicsICdzMzpQdXRPYmplY3QnXSksXG4gICAgICAgICAgICAgIFJlc291cmNlOiBNYXRjaC5hbnlWYWx1ZSgpLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSksXG4gICAgICAgIH0sXG4gICAgICAgIFJvbGVzOiBbTWF0Y2guYW55VmFsdWUoKV0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ0FwaUxhbWJkYVJvbGUgc2hvdWxkIGhhdmUgRHluYW1vREIgcmVhZC93cml0ZSBwZXJtaXNzaW9ucycsICgpID0+IHtcbiAgICAgIC8vIENoZWNrIHRoYXQgdGhlIHBvbGljeSBjb250YWlucyBEeW5hbW9EQiBwZXJtaXNzaW9uc1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OklBTTo6UG9saWN5Jywge1xuICAgICAgICBQb2xpY3lEb2N1bWVudDoge1xuICAgICAgICAgIFN0YXRlbWVudDogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgICBFZmZlY3Q6ICdBbGxvdycsXG4gICAgICAgICAgICAgIEFjdGlvbjogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICAgICAgICBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKCdkeW5hbW9kYjpQdXRJdGVtJyksXG4gICAgICAgICAgICAgIF0pLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSksXG4gICAgICAgIH0sXG4gICAgICAgIFBvbGljeU5hbWU6IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoJy4qQXBpTGFtYmRhUm9sZS4qJyksXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ0FwaUxhbWJkYVJvbGUgc2hvdWxkIGhhdmUgU1FTIHNlbmQgcGVybWlzc2lvbnMnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6SUFNOjpQb2xpY3knLCB7XG4gICAgICAgIFBvbGljeURvY3VtZW50OiB7XG4gICAgICAgICAgU3RhdGVtZW50OiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICAgIEVmZmVjdDogJ0FsbG93JyxcbiAgICAgICAgICAgICAgQWN0aW9uOiBNYXRjaC5hcnJheVdpdGgoWydzcXM6U2VuZE1lc3NhZ2UnXSksXG4gICAgICAgICAgICAgIFJlc291cmNlOiBNYXRjaC5hbnlWYWx1ZSgpLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSksXG4gICAgICAgIH0sXG4gICAgICAgIFBvbGljeU5hbWU6IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoJy4qQXBpTGFtYmRhUm9sZS4qJyksXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ1Byb2Nlc3NvckxhbWJkYVJvbGUgc2hvdWxkIGhhdmUgQmVkcm9jayBpbnZva2UgcGVybWlzc2lvbnMnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6SUFNOjpQb2xpY3knLCB7XG4gICAgICAgIFBvbGljeURvY3VtZW50OiB7XG4gICAgICAgICAgU3RhdGVtZW50OiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICAgIEVmZmVjdDogJ0FsbG93JyxcbiAgICAgICAgICAgICAgQWN0aW9uOiAnYmVkcm9jazpJbnZva2VNb2RlbCcsXG4gICAgICAgICAgICAgIFJlc291cmNlOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgICAgICAgIE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoJy4qYW50aHJvcGljLmNsYXVkZS0zLXNvbm5ldC0uKicpLFxuICAgICAgICAgICAgICAgIE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoJy4qYW50aHJvcGljLmNsYXVkZS0zLWhhaWt1LS4qJyksXG4gICAgICAgICAgICAgICAgTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cCgnLiphbnRocm9waWMuY2xhdWRlLTMtb3B1cy0uKicpLFxuICAgICAgICAgICAgICBdKSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0pLFxuICAgICAgICB9LFxuICAgICAgICBSb2xlczogW01hdGNoLmFueVZhbHVlKCldLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdQcm9jZXNzb3JMYW1iZGFSb2xlIHNob3VsZCBoYXZlIFNRUyBjb25zdW1lIHBlcm1pc3Npb25zJywgKCkgPT4ge1xuICAgICAgLy8gQ2hlY2sgdGhhdCB0aGUgcG9saWN5IGNvbnRhaW5zIFNRUyBjb25zdW1lIHBlcm1pc3Npb25zXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6SUFNOjpQb2xpY3knLCB7XG4gICAgICAgIFBvbGljeURvY3VtZW50OiB7XG4gICAgICAgICAgU3RhdGVtZW50OiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICAgIEVmZmVjdDogJ0FsbG93JyxcbiAgICAgICAgICAgICAgQWN0aW9uOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgICAgICAgIE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoJ3NxczpSZWNlaXZlTWVzc2FnZScpLFxuICAgICAgICAgICAgICBdKSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0pLFxuICAgICAgICB9LFxuICAgICAgICBQb2xpY3lOYW1lOiBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKCcuKlByb2Nlc3NvckxhbWJkYVJvbGUuKicpLFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdDbG91ZEZvcm1hdGlvbiBPdXRwdXRzJywgKCkgPT4ge1xuICAgIHRlc3QoJ3Nob3VsZCBleHBvcnQgRXNzYXlzQnVja2V0TmFtZScsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc091dHB1dCgnRXNzYXlzQnVja2V0TmFtZScsIHtcbiAgICAgICAgVmFsdWU6IE1hdGNoLmFueVZhbHVlKCksXG4gICAgICAgIEV4cG9ydDoge1xuICAgICAgICAgIE5hbWU6ICdFc3NheXNCdWNrZXROYW1lJyxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2hvdWxkIGV4cG9ydCBQcm9jZXNzaW5nUXVldWVVcmwnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNPdXRwdXQoJ1Byb2Nlc3NpbmdRdWV1ZVVybCcsIHtcbiAgICAgICAgRXhwb3J0OiB7XG4gICAgICAgICAgTmFtZTogJ1Byb2Nlc3NpbmdRdWV1ZVVybCcsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ3Nob3VsZCBleHBvcnQgTWV0cmljc1RhYmxlTmFtZScsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc091dHB1dCgnTWV0cmljc1RhYmxlTmFtZScsIHtcbiAgICAgICAgVmFsdWU6IE1hdGNoLmFueVZhbHVlKCksXG4gICAgICAgIEV4cG9ydDoge1xuICAgICAgICAgIE5hbWU6ICdNZXRyaWNzVGFibGVOYW1lJyxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2hvdWxkIGV4cG9ydCBBcGlMYW1iZGFSb2xlQXJuJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzT3V0cHV0KCdBcGlMYW1iZGFSb2xlQXJuJywge1xuICAgICAgICBFeHBvcnQ6IHtcbiAgICAgICAgICBOYW1lOiAnQXBpTGFtYmRhUm9sZUFybicsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ3Nob3VsZCBleHBvcnQgUzNVcGxvYWRMYW1iZGFSb2xlQXJuJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzT3V0cHV0KCdTM1VwbG9hZExhbWJkYVJvbGVBcm4nLCB7XG4gICAgICAgIEV4cG9ydDoge1xuICAgICAgICAgIE5hbWU6ICdTM1VwbG9hZExhbWJkYVJvbGVBcm4nLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzaG91bGQgZXhwb3J0IFByb2Nlc3NvckxhbWJkYVJvbGVBcm4nLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNPdXRwdXQoJ1Byb2Nlc3NvckxhbWJkYVJvbGVBcm4nLCB7XG4gICAgICAgIEV4cG9ydDoge1xuICAgICAgICAgIE5hbWU6ICdQcm9jZXNzb3JMYW1iZGFSb2xlQXJuJyxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2hvdWxkIGV4cG9ydCBBbGFybVRvcGljQXJuJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzT3V0cHV0KCdBbGFybVRvcGljQXJuJywge1xuICAgICAgICBFeHBvcnQ6IHtcbiAgICAgICAgICBOYW1lOiAnQWxhcm1Ub3BpY0FybicsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0Nsb3VkV2F0Y2ggT2JzZXJ2YWJpbGl0eScsICgpID0+IHtcbiAgICB0ZXN0KCdzaG91bGQgY3JlYXRlIFNOUyB0b3BpYyBmb3IgYWxhcm1zJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlNOUzo6VG9waWMnLCB7XG4gICAgICAgIERpc3BsYXlOYW1lOiAnVm9jYWJ1bGFyeSBFc3NheSBBbmFseXplciBBbGFybXMnLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzaG91bGQgY3JlYXRlIGFsYXJtIGZvciBBUEkgTGFtYmRhIGVycm9ycycsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDbG91ZFdhdGNoOjpBbGFybScsIHtcbiAgICAgICAgQWxhcm1OYW1lOiAndm9jYWItYW5hbHl6ZXItYXBpLWxhbWJkYS1lcnJvcnMnLFxuICAgICAgICBBbGFybURlc2NyaXB0aW9uOiAnQWxlcnRzIHdoZW4gQVBJIExhbWJkYSBlcnJvcnMgZXhjZWVkIHRocmVzaG9sZCcsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ3Nob3VsZCBjcmVhdGUgYWxhcm0gZm9yIFMzIFVwbG9hZCBMYW1iZGEgZXJyb3JzJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNsb3VkV2F0Y2g6OkFsYXJtJywge1xuICAgICAgICBBbGFybU5hbWU6ICd2b2NhYi1hbmFseXplci1zMy11cGxvYWQtbGFtYmRhLWVycm9ycycsXG4gICAgICAgIEFsYXJtRGVzY3JpcHRpb246ICdBbGVydHMgd2hlbiBTMyBVcGxvYWQgTGFtYmRhIGVycm9ycyBleGNlZWQgdGhyZXNob2xkJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2hvdWxkIGNyZWF0ZSBhbGFybSBmb3IgUHJvY2Vzc29yIExhbWJkYSBlcnJvcnMnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q2xvdWRXYXRjaDo6QWxhcm0nLCB7XG4gICAgICAgIEFsYXJtTmFtZTogJ3ZvY2FiLWFuYWx5emVyLXByb2Nlc3Nvci1sYW1iZGEtZXJyb3JzJyxcbiAgICAgICAgQWxhcm1EZXNjcmlwdGlvbjogJ0FsZXJ0cyB3aGVuIFByb2Nlc3NvciBMYW1iZGEgZXJyb3JzIGV4Y2VlZCB0aHJlc2hvbGQnLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzaG91bGQgY3JlYXRlIGFsYXJtIGZvciBETFEgbWVzc2FnZXMnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q2xvdWRXYXRjaDo6QWxhcm0nLCB7XG4gICAgICAgIEFsYXJtTmFtZTogJ3ZvY2FiLWFuYWx5emVyLWRscS1tZXNzYWdlcycsXG4gICAgICAgIEFsYXJtRGVzY3JpcHRpb246ICdBbGVydHMgd2hlbiBtZXNzYWdlcyBhcmUgc2VudCB0byBETFEgKHByb2Nlc3NpbmcgZmFpbHVyZXMpJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2hvdWxkIGNyZWF0ZSBhbGFybSBmb3IgUHJvY2Vzc29yIExhbWJkYSB0aHJvdHRsZXMnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q2xvdWRXYXRjaDo6QWxhcm0nLCB7XG4gICAgICAgIEFsYXJtTmFtZTogJ3ZvY2FiLWFuYWx5emVyLXByb2Nlc3Nvci1sYW1iZGEtdGhyb3R0bGVzJyxcbiAgICAgICAgQWxhcm1EZXNjcmlwdGlvbjogJ0FsZXJ0cyB3aGVuIFByb2Nlc3NvciBMYW1iZGEgaXMgdGhyb3R0bGVkJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2hvdWxkIGNyZWF0ZSBhbGFybSBmb3IgUHJvY2Vzc29yIExhbWJkYSBkdXJhdGlvbicsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDbG91ZFdhdGNoOjpBbGFybScsIHtcbiAgICAgICAgQWxhcm1OYW1lOiAndm9jYWItYW5hbHl6ZXItcHJvY2Vzc29yLWxhbWJkYS1kdXJhdGlvbicsXG4gICAgICAgIEFsYXJtRGVzY3JpcHRpb246ICdBbGVydHMgd2hlbiBQcm9jZXNzb3IgTGFtYmRhIGR1cmF0aW9uIGlzIGhpZ2ggKGFwcHJvYWNoaW5nIHRpbWVvdXQpJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2hvdWxkIGhhdmUgYXQgbGVhc3QgNiBDbG91ZFdhdGNoIGFsYXJtcycsICgpID0+IHtcbiAgICAgIC8vIEFQSSBMYW1iZGEgZXJyb3JzLCBTMyBVcGxvYWQgTGFtYmRhIGVycm9ycywgUHJvY2Vzc29yIExhbWJkYSBlcnJvcnMsXG4gICAgICAvLyBETFEgbWVzc2FnZXMsIFByb2Nlc3NvciBMYW1iZGEgdGhyb3R0bGVzLCBQcm9jZXNzb3IgTGFtYmRhIGR1cmF0aW9uXG4gICAgICBjb25zdCBhbGFybXMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OkNsb3VkV2F0Y2g6OkFsYXJtJyk7XG4gICAgICBleHBlY3QoT2JqZWN0LmtleXMoYWxhcm1zKS5sZW5ndGgpLnRvQmVHcmVhdGVyVGhhbk9yRXF1YWwoNik7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdSZXNvdXJjZSBDb3VudHMnLCAoKSA9PiB7XG4gICAgdGVzdCgnc2hvdWxkIGhhdmUgZXhhY3RseSAxIFMzIGJ1Y2tldCcsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLnJlc291cmNlQ291bnRJcygnQVdTOjpTMzo6QnVja2V0JywgMSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzaG91bGQgaGF2ZSBleGFjdGx5IDIgU1FTIHF1ZXVlcycsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLnJlc291cmNlQ291bnRJcygnQVdTOjpTUVM6OlF1ZXVlJywgMik7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzaG91bGQgaGF2ZSBleGFjdGx5IDEgRHluYW1vREIgdGFibGUnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5yZXNvdXJjZUNvdW50SXMoJ0FXUzo6RHluYW1vREI6OlRhYmxlJywgMSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzaG91bGQgaGF2ZSBhdCBsZWFzdCAzIElBTSByb2xlcyBmb3IgTGFtYmRhcycsICgpID0+IHtcbiAgICAgIC8vIFNob3VsZCBoYXZlIGF0IGxlYXN0OiBBcGlMYW1iZGEsIFMzVXBsb2FkTGFtYmRhLCBQcm9jZXNzb3JMYW1iZGEgcm9sZXNcbiAgICAgIC8vIFBsdXMgY3VzdG9tIHJlc291cmNlIHJvbGVzIGZvciBTMyBhdXRvLWRlbGV0ZSBhbmQgYnVja2V0IG5vdGlmaWNhdGlvbnNcbiAgICAgIGNvbnN0IHJvbGVzID0gdGVtcGxhdGUuZmluZFJlc291cmNlcygnQVdTOjpJQU06OlJvbGUnKTtcbiAgICAgIGV4cGVjdChPYmplY3Qua2V5cyhyb2xlcykubGVuZ3RoKS50b0JlR3JlYXRlclRoYW5PckVxdWFsKDMpO1xuICAgIH0pO1xuICB9KTtcbn0pO1xuIl19
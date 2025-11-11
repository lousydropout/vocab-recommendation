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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidm9jYWJfcmVjb21tZW5kYXRpb24udGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInZvY2FiX3JlY29tbWVuZGF0aW9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQyx1REFBeUQ7QUFDekQsa0ZBQTZFO0FBRTdFLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSxHQUFHLEVBQUU7SUFDeEMsSUFBSSxHQUFZLENBQUM7SUFDakIsSUFBSSxLQUErQixDQUFDO0lBQ3BDLElBQUksUUFBa0IsQ0FBQztJQUV2QixVQUFVLENBQUMsR0FBRyxFQUFFO1FBQ2QsR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3BCLEtBQUssR0FBRyxJQUFJLHFEQUF3QixDQUFDLEdBQUcsRUFBRSxXQUFXLEVBQUU7WUFDckQsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFO1NBQ3RELENBQUMsQ0FBQztRQUNILFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUN2QyxDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyxXQUFXLEVBQUUsR0FBRyxFQUFFO1FBQ3pCLElBQUksQ0FBQyxvREFBb0QsRUFBRSxHQUFHLEVBQUU7WUFDOUQsUUFBUSxDQUFDLHFCQUFxQixDQUFDLGlCQUFpQixFQUFFO2dCQUNoRCxVQUFVLEVBQUUscUNBQXFDO2dCQUNqRCw4QkFBOEIsRUFBRTtvQkFDOUIsZUFBZSxFQUFFLElBQUk7b0JBQ3JCLGlCQUFpQixFQUFFLElBQUk7b0JBQ3ZCLGdCQUFnQixFQUFFLElBQUk7b0JBQ3RCLHFCQUFxQixFQUFFLElBQUk7aUJBQzVCO2dCQUNELGdCQUFnQixFQUFFO29CQUNoQixpQ0FBaUMsRUFBRTt3QkFDakM7NEJBQ0UsNkJBQTZCLEVBQUU7Z0NBQzdCLFlB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cnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgVGVtcGxhdGUsIE1hdGNoIH0gZnJvbSAnYXdzLWNkay1saWIvYXNzZXJ0aW9ucyc7XG5pbXBvcnQgeyBWb2NhYlJlY29tbWVuZGF0aW9uU3RhY2sgfSBmcm9tICcuLi9saWIvdm9jYWJfcmVjb21tZW5kYXRpb24tc3RhY2snO1xuXG5kZXNjcmliZSgnVm9jYWJSZWNvbW1lbmRhdGlvblN0YWNrJywgKCkgPT4ge1xuICBsZXQgYXBwOiBjZGsuQXBwO1xuICBsZXQgc3RhY2s6IFZvY2FiUmVjb21tZW5kYXRpb25TdGFjaztcbiAgbGV0IHRlbXBsYXRlOiBUZW1wbGF0ZTtcblxuICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuICAgIHN0YWNrID0gbmV3IFZvY2FiUmVjb21tZW5kYXRpb25TdGFjayhhcHAsICdUZXN0U3RhY2snLCB7XG4gICAgICBlbnY6IHsgYWNjb3VudDogJzEyMzQ1Njc4OTAxMicsIHJlZ2lvbjogJ3VzLWVhc3QtMScgfSxcbiAgICB9KTtcbiAgICB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdTMyBCdWNrZXQnLCAoKSA9PiB7XG4gICAgdGVzdCgnc2hvdWxkIGNyZWF0ZSBFc3NheXNCdWNrZXQgd2l0aCBjb3JyZWN0IHByb3BlcnRpZXMnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6UzM6OkJ1Y2tldCcsIHtcbiAgICAgICAgQnVja2V0TmFtZTogJ3ZvY2FiLWVzc2F5cy0xMjM0NTY3ODkwMTItdXMtZWFzdC0xJyxcbiAgICAgICAgUHVibGljQWNjZXNzQmxvY2tDb25maWd1cmF0aW9uOiB7XG4gICAgICAgICAgQmxvY2tQdWJsaWNBY2xzOiB0cnVlLFxuICAgICAgICAgIEJsb2NrUHVibGljUG9saWN5OiB0cnVlLFxuICAgICAgICAgIElnbm9yZVB1YmxpY0FjbHM6IHRydWUsXG4gICAgICAgICAgUmVzdHJpY3RQdWJsaWNCdWNrZXRzOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBCdWNrZXRFbmNyeXB0aW9uOiB7XG4gICAgICAgICAgU2VydmVyU2lkZUVuY3J5cHRpb25Db25maWd1cmF0aW9uOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIFNlcnZlclNpZGVFbmNyeXB0aW9uQnlEZWZhdWx0OiB7XG4gICAgICAgICAgICAgICAgU1NFQWxnb3JpdGhtOiAnQUVTMjU2JyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2hvdWxkIGhhdmUgYXV0by1kZWxldGUgb2JqZWN0cyBjdXN0b20gcmVzb3VyY2UnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0N1c3RvbTo6UzNBdXRvRGVsZXRlT2JqZWN0cycsIHtcbiAgICAgICAgU2VydmljZVRva2VuOiBNYXRjaC5hbnlWYWx1ZSgpLFxuICAgICAgICBCdWNrZXROYW1lOiBNYXRjaC5hbnlWYWx1ZSgpLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzaG91bGQgaGF2ZSBDT1JTIGNvbmZpZ3VyYXRpb24nLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6UzM6OkJ1Y2tldCcsIHtcbiAgICAgICAgQ29yc0NvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICBDb3JzUnVsZXM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgQWxsb3dlZE9yaWdpbnM6IFsnKiddLFxuICAgICAgICAgICAgICBBbGxvd2VkTWV0aG9kczogWydHRVQnLCAnUFVUJywgJ1BPU1QnXSxcbiAgICAgICAgICAgICAgQWxsb3dlZEhlYWRlcnM6IFsnKiddLFxuICAgICAgICAgICAgICBNYXhBZ2U6IDM2MDAsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0R5bmFtb0RCIFRhYmxlJywgKCkgPT4ge1xuICAgIHRlc3QoJ3Nob3VsZCBjcmVhdGUgRXNzYXlNZXRyaWNzIHRhYmxlIHdpdGggY29ycmVjdCBzY2hlbWEnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6RHluYW1vREI6OlRhYmxlJywge1xuICAgICAgICBUYWJsZU5hbWU6ICdFc3NheU1ldHJpY3MnLFxuICAgICAgICBLZXlTY2hlbWE6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBBdHRyaWJ1dGVOYW1lOiAnZXNzYXlfaWQnLFxuICAgICAgICAgICAgS2V5VHlwZTogJ0hBU0gnLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICAgIEF0dHJpYnV0ZURlZmluaXRpb25zOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgQXR0cmlidXRlTmFtZTogJ2Vzc2F5X2lkJyxcbiAgICAgICAgICAgIEF0dHJpYnV0ZVR5cGU6ICdTJyxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgICBCaWxsaW5nTW9kZTogJ1BBWV9QRVJfUkVRVUVTVCcsXG4gICAgICAgIFNTRVNwZWNpZmljYXRpb246IHtcbiAgICAgICAgICBTU0VFbmFibGVkOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzaG91bGQgaGF2ZSBwb2ludC1pbi10aW1lIHJlY292ZXJ5IGRpc2FibGVkJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkR5bmFtb0RCOjpUYWJsZScsIHtcbiAgICAgICAgUG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHtcbiAgICAgICAgICBQb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogZmFsc2UsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ1NRUyBRdWV1ZXMnLCAoKSA9PiB7XG4gICAgdGVzdCgnc2hvdWxkIGNyZWF0ZSBQcm9jZXNzaW5nRExRIHdpdGggY29ycmVjdCBwcm9wZXJ0aWVzJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlNRUzo6UXVldWUnLCB7XG4gICAgICAgIFF1ZXVlTmFtZTogJ2Vzc2F5LXByb2Nlc3NpbmctZGxxJyxcbiAgICAgICAgTWVzc2FnZVJldGVudGlvblBlcmlvZDogMTIwOTYwMCwgLy8gMTQgZGF5cyBpbiBzZWNvbmRzXG4gICAgICAgIFNxc01hbmFnZWRTc2VFbmFibGVkOiB0cnVlLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzaG91bGQgY3JlYXRlIEVzc2F5UHJvY2Vzc2luZ1F1ZXVlIHdpdGggY29ycmVjdCBwcm9wZXJ0aWVzJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlNRUzo6UXVldWUnLCB7XG4gICAgICAgIFF1ZXVlTmFtZTogJ2Vzc2F5LXByb2Nlc3NpbmctcXVldWUnLFxuICAgICAgICBWaXNpYmlsaXR5VGltZW91dDogMzAwLCAvLyA1IG1pbnV0ZXNcbiAgICAgICAgTWVzc2FnZVJldGVudGlvblBlcmlvZDogMTIwOTYwMCwgLy8gMTQgZGF5c1xuICAgICAgICBSZWRyaXZlUG9saWN5OiB7XG4gICAgICAgICAgZGVhZExldHRlclRhcmdldEFybjogTWF0Y2guYW55VmFsdWUoKSxcbiAgICAgICAgICBtYXhSZWNlaXZlQ291bnQ6IDMsXG4gICAgICAgIH0sXG4gICAgICAgIFNxc01hbmFnZWRTc2VFbmFibGVkOiB0cnVlLFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdJQU0gUm9sZXMnLCAoKSA9PiB7XG4gICAgdGVzdCgnc2hvdWxkIGNyZWF0ZSBBcGlMYW1iZGFSb2xlIHdpdGggY29ycmVjdCB0cnVzdCBwb2xpY3knLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6SUFNOjpSb2xlJywge1xuICAgICAgICBBc3N1bWVSb2xlUG9saWN5RG9jdW1lbnQ6IHtcbiAgICAgICAgICBTdGF0ZW1lbnQ6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgRWZmZWN0OiAnQWxsb3cnLFxuICAgICAgICAgICAgICBQcmluY2lwYWw6IHtcbiAgICAgICAgICAgICAgICBTZXJ2aWNlOiAnbGFtYmRhLmFtYXpvbmF3cy5jb20nLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBBY3Rpb246ICdzdHM6QXNzdW1lUm9sZScsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICAgIE1hbmFnZWRQb2xpY3lBcm5zOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgJ0ZuOjpKb2luJzogW1xuICAgICAgICAgICAgICAnJyxcbiAgICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgICdhcm46JyxcbiAgICAgICAgICAgICAgICB7IFJlZjogJ0FXUzo6UGFydGl0aW9uJyB9LFxuICAgICAgICAgICAgICAgICc6aWFtOjphd3M6cG9saWN5L3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzaG91bGQgY3JlYXRlIFMzVXBsb2FkTGFtYmRhUm9sZScsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpJQU06OlJvbGUnLCB7XG4gICAgICAgIERlc2NyaXB0aW9uOiAnSUFNIHJvbGUgZm9yIFMzIHVwbG9hZCB0cmlnZ2VyIExhbWJkYSBmdW5jdGlvbicsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ3Nob3VsZCBjcmVhdGUgUHJvY2Vzc29yTGFtYmRhUm9sZScsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpJQU06OlJvbGUnLCB7XG4gICAgICAgIERlc2NyaXB0aW9uOiAnSUFNIHJvbGUgZm9yIGVzc2F5IHByb2Nlc3NvciBMYW1iZGEgZnVuY3Rpb24nLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdBcGlMYW1iZGFSb2xlIHNob3VsZCBoYXZlIFMzIHJlYWQvd3JpdGUgcGVybWlzc2lvbnMnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6SUFNOjpQb2xpY3knLCB7XG4gICAgICAgIFBvbGljeURvY3VtZW50OiB7XG4gICAgICAgICAgU3RhdGVtZW50OiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICAgIEVmZmVjdDogJ0FsbG93JyxcbiAgICAgICAgICAgICAgQWN0aW9uOiBNYXRjaC5hcnJheVdpdGgoWydzMzpHZXRPYmplY3QqJywgJ3MzOlB1dE9iamVjdCddKSxcbiAgICAgICAgICAgICAgUmVzb3VyY2U6IE1hdGNoLmFueVZhbHVlKCksXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdKSxcbiAgICAgICAgfSxcbiAgICAgICAgUm9sZXM6IFtNYXRjaC5hbnlWYWx1ZSgpXSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnQXBpTGFtYmRhUm9sZSBzaG91bGQgaGF2ZSBEeW5hbW9EQiByZWFkL3dyaXRlIHBlcm1pc3Npb25zJywgKCkgPT4ge1xuICAgICAgLy8gQ2hlY2sgdGhhdCB0aGUgcG9saWN5IGNvbnRhaW5zIER5bmFtb0RCIHBlcm1pc3Npb25zXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6SUFNOjpQb2xpY3knLCB7XG4gICAgICAgIFBvbGljeURvY3VtZW50OiB7XG4gICAgICAgICAgU3RhdGVtZW50OiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICAgIEVmZmVjdDogJ0FsbG93JyxcbiAgICAgICAgICAgICAgQWN0aW9uOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgICAgICAgIE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoJ2R5bmFtb2RiOlB1dEl0ZW0nKSxcbiAgICAgICAgICAgICAgXSksXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdKSxcbiAgICAgICAgfSxcbiAgICAgICAgUG9saWN5TmFtZTogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cCgnLipBcGlMYW1iZGFSb2xlLionKSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnQXBpTGFtYmRhUm9sZSBzaG91bGQgaGF2ZSBTUVMgc2VuZCBwZXJtaXNzaW9ucycsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpJQU06OlBvbGljeScsIHtcbiAgICAgICAgUG9saWN5RG9jdW1lbnQ6IHtcbiAgICAgICAgICBTdGF0ZW1lbnQ6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgICAgRWZmZWN0OiAnQWxsb3cnLFxuICAgICAgICAgICAgICBBY3Rpb246IE1hdGNoLmFycmF5V2l0aChbJ3NxczpTZW5kTWVzc2FnZSddKSxcbiAgICAgICAgICAgICAgUmVzb3VyY2U6IE1hdGNoLmFueVZhbHVlKCksXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdKSxcbiAgICAgICAgfSxcbiAgICAgICAgUG9saWN5TmFtZTogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cCgnLipBcGlMYW1iZGFSb2xlLionKSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnUHJvY2Vzc29yTGFtYmRhUm9sZSBzaG91bGQgaGF2ZSBCZWRyb2NrIGludm9rZSBwZXJtaXNzaW9ucycsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpJQU06OlBvbGljeScsIHtcbiAgICAgICAgUG9saWN5RG9jdW1lbnQ6IHtcbiAgICAgICAgICBTdGF0ZW1lbnQ6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgICAgRWZmZWN0OiAnQWxsb3cnLFxuICAgICAgICAgICAgICBBY3Rpb246ICdiZWRyb2NrOkludm9rZU1vZGVsJyxcbiAgICAgICAgICAgICAgUmVzb3VyY2U6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgICAgICAgTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cCgnLiphbnRocm9waWMuY2xhdWRlLTMtc29ubmV0LS4qJyksXG4gICAgICAgICAgICAgICAgTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cCgnLiphbnRocm9waWMuY2xhdWRlLTMtaGFpa3UtLionKSxcbiAgICAgICAgICAgICAgICBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKCcuKmFudGhyb3BpYy5jbGF1ZGUtMy1vcHVzLS4qJyksXG4gICAgICAgICAgICAgIF0pLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSksXG4gICAgICAgIH0sXG4gICAgICAgIFJvbGVzOiBbTWF0Y2guYW55VmFsdWUoKV0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ1Byb2Nlc3NvckxhbWJkYVJvbGUgc2hvdWxkIGhhdmUgU1FTIGNvbnN1bWUgcGVybWlzc2lvbnMnLCAoKSA9PiB7XG4gICAgICAvLyBDaGVjayB0aGF0IHRoZSBwb2xpY3kgY29udGFpbnMgU1FTIGNvbnN1bWUgcGVybWlzc2lvbnNcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpJQU06OlBvbGljeScsIHtcbiAgICAgICAgUG9saWN5RG9jdW1lbnQ6IHtcbiAgICAgICAgICBTdGF0ZW1lbnQ6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgICAgRWZmZWN0OiAnQWxsb3cnLFxuICAgICAgICAgICAgICBBY3Rpb246IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgICAgICAgTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cCgnc3FzOlJlY2VpdmVNZXNzYWdlJyksXG4gICAgICAgICAgICAgIF0pLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSksXG4gICAgICAgIH0sXG4gICAgICAgIFBvbGljeU5hbWU6IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoJy4qUHJvY2Vzc29yTGFtYmRhUm9sZS4qJyksXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0Nsb3VkRm9ybWF0aW9uIE91dHB1dHMnLCAoKSA9PiB7XG4gICAgdGVzdCgnc2hvdWxkIGV4cG9ydCBFc3NheXNCdWNrZXROYW1lJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzT3V0cHV0KCdFc3NheXNCdWNrZXROYW1lJywge1xuICAgICAgICBWYWx1ZTogTWF0Y2guYW55VmFsdWUoKSxcbiAgICAgICAgRXhwb3J0OiB7XG4gICAgICAgICAgTmFtZTogJ0Vzc2F5c0J1Y2tldE5hbWUnLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzaG91bGQgZXhwb3J0IFByb2Nlc3NpbmdRdWV1ZVVybCcsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc091dHB1dCgnUHJvY2Vzc2luZ1F1ZXVlVXJsJywge1xuICAgICAgICBFeHBvcnQ6IHtcbiAgICAgICAgICBOYW1lOiAnUHJvY2Vzc2luZ1F1ZXVlVXJsJyxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2hvdWxkIGV4cG9ydCBNZXRyaWNzVGFibGVOYW1lJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzT3V0cHV0KCdNZXRyaWNzVGFibGVOYW1lJywge1xuICAgICAgICBWYWx1ZTogTWF0Y2guYW55VmFsdWUoKSxcbiAgICAgICAgRXhwb3J0OiB7XG4gICAgICAgICAgTmFtZTogJ01ldHJpY3NUYWJsZU5hbWUnLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzaG91bGQgZXhwb3J0IEFwaUxhbWJkYVJvbGVBcm4nLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNPdXRwdXQoJ0FwaUxhbWJkYVJvbGVBcm4nLCB7XG4gICAgICAgIEV4cG9ydDoge1xuICAgICAgICAgIE5hbWU6ICdBcGlMYW1iZGFSb2xlQXJuJyxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2hvdWxkIGV4cG9ydCBTM1VwbG9hZExhbWJkYVJvbGVBcm4nLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNPdXRwdXQoJ1MzVXBsb2FkTGFtYmRhUm9sZUFybicsIHtcbiAgICAgICAgRXhwb3J0OiB7XG4gICAgICAgICAgTmFtZTogJ1MzVXBsb2FkTGFtYmRhUm9sZUFybicsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ3Nob3VsZCBleHBvcnQgUHJvY2Vzc29yTGFtYmRhUm9sZUFybicsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc091dHB1dCgnUHJvY2Vzc29yTGFtYmRhUm9sZUFybicsIHtcbiAgICAgICAgRXhwb3J0OiB7XG4gICAgICAgICAgTmFtZTogJ1Byb2Nlc3NvckxhbWJkYVJvbGVBcm4nLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdSZXNvdXJjZSBDb3VudHMnLCAoKSA9PiB7XG4gICAgdGVzdCgnc2hvdWxkIGhhdmUgZXhhY3RseSAxIFMzIGJ1Y2tldCcsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLnJlc291cmNlQ291bnRJcygnQVdTOjpTMzo6QnVja2V0JywgMSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzaG91bGQgaGF2ZSBleGFjdGx5IDIgU1FTIHF1ZXVlcycsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLnJlc291cmNlQ291bnRJcygnQVdTOjpTUVM6OlF1ZXVlJywgMik7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzaG91bGQgaGF2ZSBleGFjdGx5IDEgRHluYW1vREIgdGFibGUnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5yZXNvdXJjZUNvdW50SXMoJ0FXUzo6RHluYW1vREI6OlRhYmxlJywgMSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzaG91bGQgaGF2ZSBhdCBsZWFzdCAzIElBTSByb2xlcyBmb3IgTGFtYmRhcycsICgpID0+IHtcbiAgICAgIC8vIFNob3VsZCBoYXZlIGF0IGxlYXN0OiBBcGlMYW1iZGEsIFMzVXBsb2FkTGFtYmRhLCBQcm9jZXNzb3JMYW1iZGEgcm9sZXNcbiAgICAgIC8vIFBsdXMgY3VzdG9tIHJlc291cmNlIHJvbGVzIGZvciBTMyBhdXRvLWRlbGV0ZSBhbmQgYnVja2V0IG5vdGlmaWNhdGlvbnNcbiAgICAgIGNvbnN0IHJvbGVzID0gdGVtcGxhdGUuZmluZFJlc291cmNlcygnQVdTOjpJQU06OlJvbGUnKTtcbiAgICAgIGV4cGVjdChPYmplY3Qua2V5cyhyb2xlcykubGVuZ3RoKS50b0JlR3JlYXRlclRoYW5PckVxdWFsKDMpO1xuICAgIH0pO1xuICB9KTtcbn0pO1xuIl19
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
                BucketName: 'vincent-vocab-essays-123456789012-us-east-1',
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
                TableName: 'VincentVocabEssayMetrics',
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
                QueueName: 'vincent-vocab-essay-processing-dlq',
                MessageRetentionPeriod: 1209600, // 14 days in seconds
                SqsManagedSseEnabled: true,
            });
        });
        test('should create EssayProcessingQueue with correct properties', () => {
            template.hasResourceProperties('AWS::SQS::Queue', {
                QueueName: 'vincent-vocab-essay-processing-queue',
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
                DisplayName: 'vincent-vocab-essay-analyzer-alarms',
            });
        });
        test('should create alarm for API Lambda errors', () => {
            template.hasResourceProperties('AWS::CloudWatch::Alarm', {
                AlarmName: 'vincent-vocab-api-lambda-errors',
                AlarmDescription: 'Alerts when API Lambda errors exceed threshold',
            });
        });
        test('should create alarm for S3 Upload Lambda errors', () => {
            template.hasResourceProperties('AWS::CloudWatch::Alarm', {
                AlarmName: 'vincent-vocab-s3-upload-lambda-errors',
                AlarmDescription: 'Alerts when S3 Upload Lambda errors exceed threshold',
            });
        });
        test('should create alarm for Processor Lambda errors', () => {
            template.hasResourceProperties('AWS::CloudWatch::Alarm', {
                AlarmName: 'vincent-vocab-processor-lambda-errors',
                AlarmDescription: 'Alerts when Processor Lambda errors exceed threshold',
            });
        });
        test('should create alarm for DLQ messages', () => {
            template.hasResourceProperties('AWS::CloudWatch::Alarm', {
                AlarmName: 'vincent-vocab-dlq-messages',
                AlarmDescription: 'Alerts when messages are sent to DLQ (processing failures)',
            });
        });
        test('should create alarm for Processor Lambda throttles', () => {
            template.hasResourceProperties('AWS::CloudWatch::Alarm', {
                AlarmName: 'vincent-vocab-processor-lambda-throttles',
                AlarmDescription: 'Alerts when Processor Lambda is throttled',
            });
        });
        test('should create alarm for Processor Lambda duration', () => {
            template.hasResourceProperties('AWS::CloudWatch::Alarm', {
                AlarmName: 'vincent-vocab-processor-lambda-duration',
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidm9jYWJfcmVjb21tZW5kYXRpb24udGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInZvY2FiX3JlY29tbWVuZGF0aW9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQyx1REFBeUQ7QUFDekQsa0ZBQTZFO0FBRTdFLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSxHQUFHLEVBQUU7SUFDeEMsSUFBSSxHQUFZLENBQUM7SUFDakIsSUFBSSxLQUErQixDQUFDO0lBQ3BDLElBQUksUUFBa0IsQ0FBQztJQUV2QixVQUFVLENBQUMsR0FBRyxFQUFFO1FBQ2QsR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3BCLEtBQUssR0FBRyxJQUFJLHFEQUF3QixDQUFDLEdBQUcsRUFBRSxXQUFXLEVBQUU7WUFDckQsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFO1NBQ3RELENBQUMsQ0FBQztRQUNILFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUN2QyxDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyxXQUFXLEVBQUUsR0FBRyxFQUFFO1FBQ3pCLElBQUksQ0FBQyxvREFBb0QsRUFBRSxHQUFHLEVBQUU7WUFDOUQsUUFBUSxDQUFDLHFCQUFxQixDQUFDLGlCQUFpQixFQUFFO2dCQUNoRCxVQUFVLEVBQUUsNkNBQTZDO2dCQUN6RCw4QkFBOEIsRUFBRTtvQkFDOUIsZUFBZSxFQUFFLElBQUk7b0JBQ3JCLGlCQUFpQixFQUFFLElBQUk7b0JBQ3ZCLGdCQUFnQixFQUFFLElBQUk7b0JBQ3RCLHFCQUFxQixFQUFFLElBQUk7aUJBQzVCO2dCQUNELGdCQUFnQixFQUFFO29CQUNoQixpQ0FBaUMsRUFBRTt3QkFDakM7NEJBQ0UsNkJBQTZCLEVBQUU7Z0NBQzdCLFlB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QVEsQ0FBQyxpQkFBaUIsRUFBRSxHQUFHLEVBQUU7UUFDL0IsSUFBSSxDQUFDLGlDQUFpQyxFQUFFLEdBQUcsRUFBRTtZQUMzQyxRQUFRLENBQUMsZUFBZSxDQUFDLGlCQUFpQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pELENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGtDQUFrQyxFQUFFLEdBQUcsRUFBRTtZQUM1QyxRQUFRLENBQUMsZUFBZSxDQUFDLGlCQUFpQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pELENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHNDQUFzQyxFQUFFLEdBQUcsRUFBRTtZQUNoRCxRQUFRLENBQUMsZUFBZSxDQUFDLHNCQUFzQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3RELENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDhDQUE4QyxFQUFFLEdBQUcsRUFBRTtZQUN4RCx5RUFBeUU7WUFDekUseUVBQXlFO1lBQ3pFLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztZQUN2RCxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM5RCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgVGVtcGxhdGUsIE1hdGNoIH0gZnJvbSAnYXdzLWNkay1saWIvYXNzZXJ0aW9ucyc7XG5pbXBvcnQgeyBWb2NhYlJlY29tbWVuZGF0aW9uU3RhY2sgfSBmcm9tICcuLi9saWIvdm9jYWJfcmVjb21tZW5kYXRpb24tc3RhY2snO1xuXG5kZXNjcmliZSgnVm9jYWJSZWNvbW1lbmRhdGlvblN0YWNrJywgKCkgPT4ge1xuICBsZXQgYXBwOiBjZGsuQXBwO1xuICBsZXQgc3RhY2s6IFZvY2FiUmVjb21tZW5kYXRpb25TdGFjaztcbiAgbGV0IHRlbXBsYXRlOiBUZW1wbGF0ZTtcblxuICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuICAgIHN0YWNrID0gbmV3IFZvY2FiUmVjb21tZW5kYXRpb25TdGFjayhhcHAsICdUZXN0U3RhY2snLCB7XG4gICAgICBlbnY6IHsgYWNjb3VudDogJzEyMzQ1Njc4OTAxMicsIHJlZ2lvbjogJ3VzLWVhc3QtMScgfSxcbiAgICB9KTtcbiAgICB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdTMyBCdWNrZXQnLCAoKSA9PiB7XG4gICAgdGVzdCgnc2hvdWxkIGNyZWF0ZSBFc3NheXNCdWNrZXQgd2l0aCBjb3JyZWN0IHByb3BlcnRpZXMnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6UzM6OkJ1Y2tldCcsIHtcbiAgICAgICAgQnVja2V0TmFtZTogJ3ZpbmNlbnQtdm9jYWItZXNzYXlzLTEyMzQ1Njc4OTAxMi11cy1lYXN0LTEnLFxuICAgICAgICBQdWJsaWNBY2Nlc3NCbG9ja0NvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICBCbG9ja1B1YmxpY0FjbHM6IHRydWUsXG4gICAgICAgICAgQmxvY2tQdWJsaWNQb2xpY3k6IHRydWUsXG4gICAgICAgICAgSWdub3JlUHVibGljQWNsczogdHJ1ZSxcbiAgICAgICAgICBSZXN0cmljdFB1YmxpY0J1Y2tldHM6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIEJ1Y2tldEVuY3J5cHRpb246IHtcbiAgICAgICAgICBTZXJ2ZXJTaWRlRW5jcnlwdGlvbkNvbmZpZ3VyYXRpb246IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgU2VydmVyU2lkZUVuY3J5cHRpb25CeURlZmF1bHQ6IHtcbiAgICAgICAgICAgICAgICBTU0VBbGdvcml0aG06ICdBRVMyNTYnLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzaG91bGQgaGF2ZSBhdXRvLWRlbGV0ZSBvYmplY3RzIGN1c3RvbSByZXNvdXJjZScsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQ3VzdG9tOjpTM0F1dG9EZWxldGVPYmplY3RzJywge1xuICAgICAgICBTZXJ2aWNlVG9rZW46IE1hdGNoLmFueVZhbHVlKCksXG4gICAgICAgIEJ1Y2tldE5hbWU6IE1hdGNoLmFueVZhbHVlKCksXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ3Nob3VsZCBoYXZlIENPUlMgY29uZmlndXJhdGlvbicsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTMzo6QnVja2V0Jywge1xuICAgICAgICBDb3JzQ29uZmlndXJhdGlvbjoge1xuICAgICAgICAgIENvcnNSdWxlczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBBbGxvd2VkT3JpZ2luczogWycqJ10sXG4gICAgICAgICAgICAgIEFsbG93ZWRNZXRob2RzOiBbJ0dFVCcsICdQVVQnLCAnUE9TVCddLFxuICAgICAgICAgICAgICBBbGxvd2VkSGVhZGVyczogWycqJ10sXG4gICAgICAgICAgICAgIE1heEFnZTogMzYwMCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnRHluYW1vREIgVGFibGUnLCAoKSA9PiB7XG4gICAgdGVzdCgnc2hvdWxkIGNyZWF0ZSBFc3NheU1ldHJpY3MgdGFibGUgd2l0aCBjb3JyZWN0IHNjaGVtYScsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpEeW5hbW9EQjo6VGFibGUnLCB7XG4gICAgICAgIFRhYmxlTmFtZTogJ1ZpbmNlbnRWb2NhYkVzc2F5TWV0cmljcycsXG4gICAgICAgIEtleVNjaGVtYTogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIEF0dHJpYnV0ZU5hbWU6ICdlc3NheV9pZCcsXG4gICAgICAgICAgICBLZXlUeXBlOiAnSEFTSCcsXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgICAgQXR0cmlidXRlRGVmaW5pdGlvbnM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBBdHRyaWJ1dGVOYW1lOiAnZXNzYXlfaWQnLFxuICAgICAgICAgICAgQXR0cmlidXRlVHlwZTogJ1MnLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICAgIEJpbGxpbmdNb2RlOiAnUEFZX1BFUl9SRVFVRVNUJyxcbiAgICAgICAgU1NFU3BlY2lmaWNhdGlvbjoge1xuICAgICAgICAgIFNTRUVuYWJsZWQ6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ3Nob3VsZCBoYXZlIHBvaW50LWluLXRpbWUgcmVjb3ZlcnkgZGlzYWJsZWQnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6RHluYW1vREI6OlRhYmxlJywge1xuICAgICAgICBQb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjoge1xuICAgICAgICAgIFBvaW50SW5UaW1lUmVjb3ZlcnlFbmFibGVkOiBmYWxzZSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnU1FTIFF1ZXVlcycsICgpID0+IHtcbiAgICB0ZXN0KCdzaG91bGQgY3JlYXRlIFByb2Nlc3NpbmdETFEgd2l0aCBjb3JyZWN0IHByb3BlcnRpZXMnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6U1FTOjpRdWV1ZScsIHtcbiAgICAgICAgUXVldWVOYW1lOiAndmluY2VudC12b2NhYi1lc3NheS1wcm9jZXNzaW5nLWRscScsXG4gICAgICAgIE1lc3NhZ2VSZXRlbnRpb25QZXJpb2Q6IDEyMDk2MDAsIC8vIDE0IGRheXMgaW4gc2Vjb25kc1xuICAgICAgICBTcXNNYW5hZ2VkU3NlRW5hYmxlZDogdHJ1ZSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2hvdWxkIGNyZWF0ZSBFc3NheVByb2Nlc3NpbmdRdWV1ZSB3aXRoIGNvcnJlY3QgcHJvcGVydGllcycsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTUVM6OlF1ZXVlJywge1xuICAgICAgICBRdWV1ZU5hbWU6ICd2aW5jZW50LXZvY2FiLWVzc2F5LXByb2Nlc3NpbmctcXVldWUnLFxuICAgICAgICBWaXNpYmlsaXR5VGltZW91dDogMzAwLCAvLyA1IG1pbnV0ZXNcbiAgICAgICAgTWVzc2FnZVJldGVudGlvblBlcmlvZDogMTIwOTYwMCwgLy8gMTQgZGF5c1xuICAgICAgICBSZWRyaXZlUG9saWN5OiB7XG4gICAgICAgICAgZGVhZExldHRlclRhcmdldEFybjogTWF0Y2guYW55VmFsdWUoKSxcbiAgICAgICAgICBtYXhSZWNlaXZlQ291bnQ6IDMsXG4gICAgICAgIH0sXG4gICAgICAgIFNxc01hbmFnZWRTc2VFbmFibGVkOiB0cnVlLFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdJQU0gUm9sZXMnLCAoKSA9PiB7XG4gICAgdGVzdCgnc2hvdWxkIGNyZWF0ZSBBcGlMYW1iZGFSb2xlIHdpdGggY29ycmVjdCB0cnVzdCBwb2xpY3knLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6SUFNOjpSb2xlJywge1xuICAgICAgICBBc3N1bWVSb2xlUG9saWN5RG9jdW1lbnQ6IHtcbiAgICAgICAgICBTdGF0ZW1lbnQ6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgRWZmZWN0OiAnQWxsb3cnLFxuICAgICAgICAgICAgICBQcmluY2lwYWw6IHtcbiAgICAgICAgICAgICAgICBTZXJ2aWNlOiAnbGFtYmRhLmFtYXpvbmF3cy5jb20nLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBBY3Rpb246ICdzdHM6QXNzdW1lUm9sZScsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICAgIE1hbmFnZWRQb2xpY3lBcm5zOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgJ0ZuOjpKb2luJzogW1xuICAgICAgICAgICAgICAnJyxcbiAgICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgICdhcm46JyxcbiAgICAgICAgICAgICAgICB7IFJlZjogJ0FXUzo6UGFydGl0aW9uJyB9LFxuICAgICAgICAgICAgICAgICc6aWFtOjphd3M6cG9saWN5L3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzaG91bGQgY3JlYXRlIFMzVXBsb2FkTGFtYmRhUm9sZScsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpJQU06OlJvbGUnLCB7XG4gICAgICAgIERlc2NyaXB0aW9uOiAnSUFNIHJvbGUgZm9yIFMzIHVwbG9hZCB0cmlnZ2VyIExhbWJkYSBmdW5jdGlvbicsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ3Nob3VsZCBjcmVhdGUgUHJvY2Vzc29yTGFtYmRhUm9sZScsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpJQU06OlJvbGUnLCB7XG4gICAgICAgIERlc2NyaXB0aW9uOiAnSUFNIHJvbGUgZm9yIGVzc2F5IHByb2Nlc3NvciBMYW1iZGEgZnVuY3Rpb24nLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdBcGlMYW1iZGFSb2xlIHNob3VsZCBoYXZlIFMzIHJlYWQvd3JpdGUgcGVybWlzc2lvbnMnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6SUFNOjpQb2xpY3knLCB7XG4gICAgICAgIFBvbGljeURvY3VtZW50OiB7XG4gICAgICAgICAgU3RhdGVtZW50OiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICAgIEVmZmVjdDogJ0FsbG93JyxcbiAgICAgICAgICAgICAgQWN0aW9uOiBNYXRjaC5hcnJheVdpdGgoWydzMzpHZXRPYmplY3QqJywgJ3MzOlB1dE9iamVjdCddKSxcbiAgICAgICAgICAgICAgUmVzb3VyY2U6IE1hdGNoLmFueVZhbHVlKCksXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdKSxcbiAgICAgICAgfSxcbiAgICAgICAgUm9sZXM6IFtNYXRjaC5hbnlWYWx1ZSgpXSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnQXBpTGFtYmRhUm9sZSBzaG91bGQgaGF2ZSBEeW5hbW9EQiByZWFkL3dyaXRlIHBlcm1pc3Npb25zJywgKCkgPT4ge1xuICAgICAgLy8gQ2hlY2sgdGhhdCB0aGUgcG9saWN5IGNvbnRhaW5zIER5bmFtb0RCIHBlcm1pc3Npb25zXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6SUFNOjpQb2xpY3knLCB7XG4gICAgICAgIFBvbGljeURvY3VtZW50OiB7XG4gICAgICAgICAgU3RhdGVtZW50OiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICAgIEVmZmVjdDogJ0FsbG93JyxcbiAgICAgICAgICAgICAgQWN0aW9uOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgICAgICAgIE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoJ2R5bmFtb2RiOlB1dEl0ZW0nKSxcbiAgICAgICAgICAgICAgXSksXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdKSxcbiAgICAgICAgfSxcbiAgICAgICAgUG9saWN5TmFtZTogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cCgnLipBcGlMYW1iZGFSb2xlLionKSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnQXBpTGFtYmRhUm9sZSBzaG91bGQgaGF2ZSBTUVMgc2VuZCBwZXJtaXNzaW9ucycsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpJQU06OlBvbGljeScsIHtcbiAgICAgICAgUG9saWN5RG9jdW1lbnQ6IHtcbiAgICAgICAgICBTdGF0ZW1lbnQ6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgICAgRWZmZWN0OiAnQWxsb3cnLFxuICAgICAgICAgICAgICBBY3Rpb246IE1hdGNoLmFycmF5V2l0aChbJ3NxczpTZW5kTWVzc2FnZSddKSxcbiAgICAgICAgICAgICAgUmVzb3VyY2U6IE1hdGNoLmFueVZhbHVlKCksXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdKSxcbiAgICAgICAgfSxcbiAgICAgICAgUG9saWN5TmFtZTogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cCgnLipBcGlMYW1iZGFSb2xlLionKSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnUHJvY2Vzc29yTGFtYmRhUm9sZSBzaG91bGQgaGF2ZSBCZWRyb2NrIGludm9rZSBwZXJtaXNzaW9ucycsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpJQU06OlBvbGljeScsIHtcbiAgICAgICAgUG9saWN5RG9jdW1lbnQ6IHtcbiAgICAgICAgICBTdGF0ZW1lbnQ6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgICAgRWZmZWN0OiAnQWxsb3cnLFxuICAgICAgICAgICAgICBBY3Rpb246ICdiZWRyb2NrOkludm9rZU1vZGVsJyxcbiAgICAgICAgICAgICAgUmVzb3VyY2U6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgICAgICAgTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cCgnLiphbnRocm9waWMuY2xhdWRlLTMtc29ubmV0LS4qJyksXG4gICAgICAgICAgICAgICAgTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cCgnLiphbnRocm9waWMuY2xhdWRlLTMtaGFpa3UtLionKSxcbiAgICAgICAgICAgICAgICBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKCcuKmFudGhyb3BpYy5jbGF1ZGUtMy1vcHVzLS4qJyksXG4gICAgICAgICAgICAgIF0pLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSksXG4gICAgICAgIH0sXG4gICAgICAgIFJvbGVzOiBbTWF0Y2guYW55VmFsdWUoKV0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ1Byb2Nlc3NvckxhbWJkYVJvbGUgc2hvdWxkIGhhdmUgU1FTIGNvbnN1bWUgcGVybWlzc2lvbnMnLCAoKSA9PiB7XG4gICAgICAvLyBDaGVjayB0aGF0IHRoZSBwb2xpY3kgY29udGFpbnMgU1FTIGNvbnN1bWUgcGVybWlzc2lvbnNcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpJQU06OlBvbGljeScsIHtcbiAgICAgICAgUG9saWN5RG9jdW1lbnQ6IHtcbiAgICAgICAgICBTdGF0ZW1lbnQ6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgICAgRWZmZWN0OiAnQWxsb3cnLFxuICAgICAgICAgICAgICBBY3Rpb246IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgICAgICAgTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cCgnc3FzOlJlY2VpdmVNZXNzYWdlJyksXG4gICAgICAgICAgICAgIF0pLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSksXG4gICAgICAgIH0sXG4gICAgICAgIFBvbGljeU5hbWU6IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoJy4qUHJvY2Vzc29yTGFtYmRhUm9sZS4qJyksXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0Nsb3VkRm9ybWF0aW9uIE91dHB1dHMnLCAoKSA9PiB7XG4gICAgdGVzdCgnc2hvdWxkIGV4cG9ydCBFc3NheXNCdWNrZXROYW1lJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzT3V0cHV0KCdFc3NheXNCdWNrZXROYW1lJywge1xuICAgICAgICBWYWx1ZTogTWF0Y2guYW55VmFsdWUoKSxcbiAgICAgICAgRXhwb3J0OiB7XG4gICAgICAgICAgTmFtZTogJ0Vzc2F5c0J1Y2tldE5hbWUnLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzaG91bGQgZXhwb3J0IFByb2Nlc3NpbmdRdWV1ZVVybCcsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc091dHB1dCgnUHJvY2Vzc2luZ1F1ZXVlVXJsJywge1xuICAgICAgICBFeHBvcnQ6IHtcbiAgICAgICAgICBOYW1lOiAnUHJvY2Vzc2luZ1F1ZXVlVXJsJyxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2hvdWxkIGV4cG9ydCBNZXRyaWNzVGFibGVOYW1lJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzT3V0cHV0KCdNZXRyaWNzVGFibGVOYW1lJywge1xuICAgICAgICBWYWx1ZTogTWF0Y2guYW55VmFsdWUoKSxcbiAgICAgICAgRXhwb3J0OiB7XG4gICAgICAgICAgTmFtZTogJ01ldHJpY3NUYWJsZU5hbWUnLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzaG91bGQgZXhwb3J0IEFwaUxhbWJkYVJvbGVBcm4nLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNPdXRwdXQoJ0FwaUxhbWJkYVJvbGVBcm4nLCB7XG4gICAgICAgIEV4cG9ydDoge1xuICAgICAgICAgIE5hbWU6ICdBcGlMYW1iZGFSb2xlQXJuJyxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2hvdWxkIGV4cG9ydCBTM1VwbG9hZExhbWJkYVJvbGVBcm4nLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNPdXRwdXQoJ1MzVXBsb2FkTGFtYmRhUm9sZUFybicsIHtcbiAgICAgICAgRXhwb3J0OiB7XG4gICAgICAgICAgTmFtZTogJ1MzVXBsb2FkTGFtYmRhUm9sZUFybicsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ3Nob3VsZCBleHBvcnQgUHJvY2Vzc29yTGFtYmRhUm9sZUFybicsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc091dHB1dCgnUHJvY2Vzc29yTGFtYmRhUm9sZUFybicsIHtcbiAgICAgICAgRXhwb3J0OiB7XG4gICAgICAgICAgTmFtZTogJ1Byb2Nlc3NvckxhbWJkYVJvbGVBcm4nLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzaG91bGQgZXhwb3J0IEFsYXJtVG9waWNBcm4nLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNPdXRwdXQoJ0FsYXJtVG9waWNBcm4nLCB7XG4gICAgICAgIEV4cG9ydDoge1xuICAgICAgICAgIE5hbWU6ICdBbGFybVRvcGljQXJuJyxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnQ2xvdWRXYXRjaCBPYnNlcnZhYmlsaXR5JywgKCkgPT4ge1xuICAgIHRlc3QoJ3Nob3VsZCBjcmVhdGUgU05TIHRvcGljIGZvciBhbGFybXMnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6U05TOjpUb3BpYycsIHtcbiAgICAgICAgRGlzcGxheU5hbWU6ICd2aW5jZW50LXZvY2FiLWVzc2F5LWFuYWx5emVyLWFsYXJtcycsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ3Nob3VsZCBjcmVhdGUgYWxhcm0gZm9yIEFQSSBMYW1iZGEgZXJyb3JzJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNsb3VkV2F0Y2g6OkFsYXJtJywge1xuICAgICAgICBBbGFybU5hbWU6ICd2aW5jZW50LXZvY2FiLWFwaS1sYW1iZGEtZXJyb3JzJyxcbiAgICAgICAgQWxhcm1EZXNjcmlwdGlvbjogJ0FsZXJ0cyB3aGVuIEFQSSBMYW1iZGEgZXJyb3JzIGV4Y2VlZCB0aHJlc2hvbGQnLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzaG91bGQgY3JlYXRlIGFsYXJtIGZvciBTMyBVcGxvYWQgTGFtYmRhIGVycm9ycycsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDbG91ZFdhdGNoOjpBbGFybScsIHtcbiAgICAgICAgQWxhcm1OYW1lOiAndmluY2VudC12b2NhYi1zMy11cGxvYWQtbGFtYmRhLWVycm9ycycsXG4gICAgICAgIEFsYXJtRGVzY3JpcHRpb246ICdBbGVydHMgd2hlbiBTMyBVcGxvYWQgTGFtYmRhIGVycm9ycyBleGNlZWQgdGhyZXNob2xkJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2hvdWxkIGNyZWF0ZSBhbGFybSBmb3IgUHJvY2Vzc29yIExhbWJkYSBlcnJvcnMnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q2xvdWRXYXRjaDo6QWxhcm0nLCB7XG4gICAgICAgIEFsYXJtTmFtZTogJ3ZpbmNlbnQtdm9jYWItcHJvY2Vzc29yLWxhbWJkYS1lcnJvcnMnLFxuICAgICAgICBBbGFybURlc2NyaXB0aW9uOiAnQWxlcnRzIHdoZW4gUHJvY2Vzc29yIExhbWJkYSBlcnJvcnMgZXhjZWVkIHRocmVzaG9sZCcsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ3Nob3VsZCBjcmVhdGUgYWxhcm0gZm9yIERMUSBtZXNzYWdlcycsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDbG91ZFdhdGNoOjpBbGFybScsIHtcbiAgICAgICAgQWxhcm1OYW1lOiAndmluY2VudC12b2NhYi1kbHEtbWVzc2FnZXMnLFxuICAgICAgICBBbGFybURlc2NyaXB0aW9uOiAnQWxlcnRzIHdoZW4gbWVzc2FnZXMgYXJlIHNlbnQgdG8gRExRIChwcm9jZXNzaW5nIGZhaWx1cmVzKScsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ3Nob3VsZCBjcmVhdGUgYWxhcm0gZm9yIFByb2Nlc3NvciBMYW1iZGEgdGhyb3R0bGVzJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNsb3VkV2F0Y2g6OkFsYXJtJywge1xuICAgICAgICBBbGFybU5hbWU6ICd2aW5jZW50LXZvY2FiLXByb2Nlc3Nvci1sYW1iZGEtdGhyb3R0bGVzJyxcbiAgICAgICAgQWxhcm1EZXNjcmlwdGlvbjogJ0FsZXJ0cyB3aGVuIFByb2Nlc3NvciBMYW1iZGEgaXMgdGhyb3R0bGVkJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2hvdWxkIGNyZWF0ZSBhbGFybSBmb3IgUHJvY2Vzc29yIExhbWJkYSBkdXJhdGlvbicsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDbG91ZFdhdGNoOjpBbGFybScsIHtcbiAgICAgICAgQWxhcm1OYW1lOiAndmluY2VudC12b2NhYi1wcm9jZXNzb3ItbGFtYmRhLWR1cmF0aW9uJyxcbiAgICAgICAgQWxhcm1EZXNjcmlwdGlvbjogJ0FsZXJ0cyB3aGVuIFByb2Nlc3NvciBMYW1iZGEgZHVyYXRpb24gaXMgaGlnaCAoYXBwcm9hY2hpbmcgdGltZW91dCknLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzaG91bGQgaGF2ZSBhdCBsZWFzdCA2IENsb3VkV2F0Y2ggYWxhcm1zJywgKCkgPT4ge1xuICAgICAgLy8gQVBJIExhbWJkYSBlcnJvcnMsIFMzIFVwbG9hZCBMYW1iZGEgZXJyb3JzLCBQcm9jZXNzb3IgTGFtYmRhIGVycm9ycyxcbiAgICAgIC8vIERMUSBtZXNzYWdlcywgUHJvY2Vzc29yIExhbWJkYSB0aHJvdHRsZXMsIFByb2Nlc3NvciBMYW1iZGEgZHVyYXRpb25cbiAgICAgIGNvbnN0IGFsYXJtcyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoJ0FXUzo6Q2xvdWRXYXRjaDo6QWxhcm0nKTtcbiAgICAgIGV4cGVjdChPYmplY3Qua2V5cyhhbGFybXMpLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuT3JFcXVhbCg2KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ1Jlc291cmNlIENvdW50cycsICgpID0+IHtcbiAgICB0ZXN0KCdzaG91bGQgaGF2ZSBleGFjdGx5IDEgUzMgYnVja2V0JywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUucmVzb3VyY2VDb3VudElzKCdBV1M6OlMzOjpCdWNrZXQnLCAxKTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ3Nob3VsZCBoYXZlIGV4YWN0bHkgMiBTUVMgcXVldWVzJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUucmVzb3VyY2VDb3VudElzKCdBV1M6OlNRUzo6UXVldWUnLCAyKTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ3Nob3VsZCBoYXZlIGV4YWN0bHkgMSBEeW5hbW9EQiB0YWJsZScsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLnJlc291cmNlQ291bnRJcygnQVdTOjpEeW5hbW9EQjo6VGFibGUnLCAxKTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ3Nob3VsZCBoYXZlIGF0IGxlYXN0IDMgSUFNIHJvbGVzIGZvciBMYW1iZGFzJywgKCkgPT4ge1xuICAgICAgLy8gU2hvdWxkIGhhdmUgYXQgbGVhc3Q6IEFwaUxhbWJkYSwgUzNVcGxvYWRMYW1iZGEsIFByb2Nlc3NvckxhbWJkYSByb2xlc1xuICAgICAgLy8gUGx1cyBjdXN0b20gcmVzb3VyY2Ugcm9sZXMgZm9yIFMzIGF1dG8tZGVsZXRlIGFuZCBidWNrZXQgbm90aWZpY2F0aW9uc1xuICAgICAgY29uc3Qgcm9sZXMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OklBTTo6Um9sZScpO1xuICAgICAgZXhwZWN0KE9iamVjdC5rZXlzKHJvbGVzKS5sZW5ndGgpLnRvQmVHcmVhdGVyVGhhbk9yRXF1YWwoMyk7XG4gICAgfSk7XG4gIH0pO1xufSk7XG4iXX0=
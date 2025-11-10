import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { VocabRecommendationStack } from '../lib/vocab_recommendation-stack';

describe('VocabRecommendationStack', () => {
  let app: cdk.App;
  let stack: VocabRecommendationStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new VocabRecommendationStack(app, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });
    template = Template.fromStack(stack);
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
        ServiceToken: Match.anyValue(),
        BucketName: Match.anyValue(),
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
          deadLetterTargetArn: Match.anyValue(),
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
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Action: Match.arrayWith(['s3:GetObject*', 's3:PutObject']),
              Resource: Match.anyValue(),
            }),
          ]),
        },
        Roles: [Match.anyValue()],
      });
    });

    test('ApiLambdaRole should have DynamoDB read/write permissions', () => {
      // Check that the policy contains DynamoDB permissions
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Action: Match.arrayWith([
                Match.stringLikeRegexp('dynamodb:PutItem'),
              ]),
            }),
          ]),
        },
        PolicyName: Match.stringLikeRegexp('.*ApiLambdaRole.*'),
      });
    });

    test('ApiLambdaRole should have SQS send permissions', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Action: Match.arrayWith(['sqs:SendMessage']),
              Resource: Match.anyValue(),
            }),
          ]),
        },
        PolicyName: Match.stringLikeRegexp('.*ApiLambdaRole.*'),
      });
    });

    test('ProcessorLambdaRole should have Bedrock invoke permissions', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Action: 'bedrock:InvokeModel',
              Resource: Match.arrayWith([
                Match.stringLikeRegexp('.*anthropic.claude-3-sonnet-.*'),
                Match.stringLikeRegexp('.*anthropic.claude-3-haiku-.*'),
                Match.stringLikeRegexp('.*anthropic.claude-3-opus-.*'),
              ]),
            }),
          ]),
        },
        Roles: [Match.anyValue()],
      });
    });

    test('ProcessorLambdaRole should have SQS consume permissions', () => {
      // Check that the policy contains SQS consume permissions
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Action: Match.arrayWith([
                Match.stringLikeRegexp('sqs:ReceiveMessage'),
              ]),
            }),
          ]),
        },
        PolicyName: Match.stringLikeRegexp('.*ProcessorLambdaRole.*'),
      });
    });
  });

  describe('CloudFormation Outputs', () => {
    test('should export EssaysBucketName', () => {
      template.hasOutput('EssaysBucketName', {
        Value: Match.anyValue(),
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
        Value: Match.anyValue(),
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

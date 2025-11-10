import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';

export class VocabRecommendationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 Bucket for essay uploads
    const essaysBucket = new s3.Bucket(this, 'EssaysBucket', {
      bucketName: `vocab-essays-${this.account}-${this.region}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For PoC - allows bucket deletion
      autoDeleteObjects: true, // Automatically delete objects when stack is deleted
      versioned: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedOrigins: ['*'],
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
          allowedHeaders: ['*'],
          maxAge: 3600,
        },
      ],
    });

    // SQS Dead Letter Queue
    const dlq = new sqs.Queue(this, 'ProcessingDLQ', {
      queueName: 'essay-processing-dlq',
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // SQS Queue for essay processing
    const processingQueue = new sqs.Queue(this, 'EssayProcessingQueue', {
      queueName: 'essay-processing-queue',
      visibilityTimeout: cdk.Duration.minutes(5), // Must be >= Lambda timeout
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      deadLetterQueue: {
        queue: dlq,
        maxReceiveCount: 3, // Retry 3 times before sending to DLQ
      },
    });

    // DynamoDB Table for essay metrics
    const metricsTable = new dynamodb.Table(this, 'EssayMetrics', {
      tableName: 'EssayMetrics',
      partitionKey: { name: 'essay_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // On-demand pricing for PoC
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For PoC - allows table deletion
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: false, // Can enable for production
      },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // IAM Role for API Lambda (will be used in Epic 2)
    const apiLambdaRole = new iam.Role(this, 'ApiLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'IAM role for API Lambda function',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant permissions for API Lambda
    essaysBucket.grantReadWrite(apiLambdaRole);
    metricsTable.grantReadWriteData(apiLambdaRole);
    processingQueue.grantSendMessages(apiLambdaRole);

    // IAM Role for S3 Upload Lambda (will be used in Epic 2)
    // This Lambda will be triggered by S3 events and push to SQS
    const s3UploadLambdaRole = new iam.Role(this, 'S3UploadLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'IAM role for S3 upload trigger Lambda function',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant permissions for S3 Upload Lambda
    essaysBucket.grantRead(s3UploadLambdaRole);
    processingQueue.grantSendMessages(s3UploadLambdaRole);

    // IAM Role for Processor Lambda (will be used in Epic 3)
    const processorLambdaRole = new iam.Role(this, 'ProcessorLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'IAM role for essay processor Lambda function',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant permissions for Processor Lambda
    essaysBucket.grantRead(processorLambdaRole);
    metricsTable.grantReadWriteData(processorLambdaRole);
    processingQueue.grantConsumeMessages(processorLambdaRole);

    // Grant Bedrock permissions for Processor Lambda
    processorLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-sonnet-*`,
          `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-haiku-*`,
          `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-opus-*`,
        ],
      })
    );

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'EssaysBucketName', {
      value: essaysBucket.bucketName,
      description: 'S3 bucket name for essay storage',
      exportName: 'EssaysBucketName',
    });

    new cdk.CfnOutput(this, 'ProcessingQueueUrl', {
      value: processingQueue.queueUrl,
      description: 'SQS queue URL for essay processing',
      exportName: 'ProcessingQueueUrl',
    });

    new cdk.CfnOutput(this, 'MetricsTableName', {
      value: metricsTable.tableName,
      description: 'DynamoDB table name for essay metrics',
      exportName: 'MetricsTableName',
    });

    new cdk.CfnOutput(this, 'ApiLambdaRoleArn', {
      value: apiLambdaRole.roleArn,
      description: 'IAM role ARN for API Lambda',
      exportName: 'ApiLambdaRoleArn',
    });

    new cdk.CfnOutput(this, 'S3UploadLambdaRoleArn', {
      value: s3UploadLambdaRole.roleArn,
      description: 'IAM role ARN for S3 upload trigger Lambda',
      exportName: 'S3UploadLambdaRoleArn',
    });

    new cdk.CfnOutput(this, 'ProcessorLambdaRoleArn', {
      value: processorLambdaRole.roleArn,
      description: 'IAM role ARN for processor Lambda',
      exportName: 'ProcessorLambdaRoleArn',
    });
  }
}

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as path from 'path';

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

    // API Lambda Function
    // Skip bundling in test environment (Docker not available)
    const apiLambdaCode = process.env.CDK_SKIP_BUNDLING === 'true'
      ? lambda.Code.fromAsset(path.join(__dirname, '../lambda/api'))
      : lambda.Code.fromAsset(path.join(__dirname, '../lambda/api'), {
          bundling: {
            image: lambda.Runtime.PYTHON_3_12.bundlingImage,
            command: [
              'bash', '-c',
              'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output',
            ],
          },
        });
    
    const apiLambda = new lambda.Function(this, 'ApiLambda', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'lambda_function.handler',
      code: apiLambdaCode,
      role: apiLambdaRole,
      timeout: cdk.Duration.seconds(30),
      environment: {
        ESSAYS_BUCKET: essaysBucket.bucketName,
        METRICS_TABLE: metricsTable.tableName,
        PROCESSING_QUEUE_URL: processingQueue.queueUrl,
      },
    });

    // S3 Upload Trigger Lambda Function
    // Skip bundling in test environment (Docker not available)
    const s3UploadLambdaCode = process.env.CDK_SKIP_BUNDLING === 'true'
      ? lambda.Code.fromAsset(path.join(__dirname, '../lambda/s3_upload_trigger'))
      : lambda.Code.fromAsset(path.join(__dirname, '../lambda/s3_upload_trigger'), {
          bundling: {
            image: lambda.Runtime.PYTHON_3_12.bundlingImage,
            command: [
              'bash', '-c',
              'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output',
            ],
          },
        });
    
    const s3UploadLambda = new lambda.Function(this, 'S3UploadLambda', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'lambda_function.handler',
      code: s3UploadLambdaCode,
      role: s3UploadLambdaRole,
      timeout: cdk.Duration.seconds(30),
      environment: {
        PROCESSING_QUEUE_URL: processingQueue.queueUrl,
      },
    });

    // S3 Event Notification - trigger Lambda on object creation
    essaysBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(s3UploadLambda),
      { prefix: 'essays/' }
    );

    // API Gateway
    const api = new apigateway.RestApi(this, 'VocabApi', {
      restApiName: 'Vocabulary Essay Analyzer API',
      description: 'API for vocabulary essay analysis',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key'],
      },
    });

    // API Gateway Integration
    const apiIntegration = new apigateway.LambdaIntegration(apiLambda);

    // POST /essay endpoint
    const essayResource = api.root.addResource('essay');
    essayResource.addMethod('POST', apiIntegration);

    // GET /essay/{essay_id} endpoint
    const essayIdResource = essayResource.addResource('{essay_id}');
    essayIdResource.addMethod('GET', apiIntegration);

    // Health check endpoint
    const healthResource = api.root.addResource('health');
    healthResource.addMethod('GET', apiIntegration);

    // Processor Lambda Function (Container Image)
    // Using container image instead of layer due to size limits (spaCy + model > 250MB)
    const processorLambda = new lambda.DockerImageFunction(this, 'ProcessorLambda', {
      code: lambda.DockerImageCode.fromImageAsset(
        path.join(__dirname, '../lambda/processor'),
        {
          // Dockerfile is in lambda/processor/Dockerfile
        }
      ),
      role: processorLambdaRole,
      timeout: cdk.Duration.minutes(5), // Must match SQS visibility timeout
      memorySize: 3008, // High memory for spaCy model loading
      environment: {
        ESSAYS_BUCKET: essaysBucket.bucketName,
        METRICS_TABLE: metricsTable.tableName,
        BEDROCK_MODEL_ID: 'anthropic.claude-3-sonnet-20240229-v1:0',
        // AWS_REGION is automatically set by Lambda runtime
      },
    });

    // SQS Event Source for Processor Lambda
    processorLambda.addEventSource(
      new lambdaEventSources.SqsEventSource(processingQueue, {
        batchSize: 1, // Process one essay at a time
        maxBatchingWindow: cdk.Duration.seconds(0),
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

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway endpoint URL',
      exportName: 'ApiUrl',
    });

    new cdk.CfnOutput(this, 'ProcessorLambdaArn', {
      value: processorLambda.functionArn,
      description: 'Processor Lambda function ARN',
      exportName: 'ProcessorLambdaArn',
    });
  }
}

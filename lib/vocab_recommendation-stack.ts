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
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as path from 'path';

export class VocabRecommendationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 Bucket for essay uploads
    const essaysBucket = new s3.Bucket(this, 'EssaysBucket', {
      bucketName: `vincent-vocab-essays-${this.account}-${this.region}`,
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
      queueName: 'vincent-vocab-essay-processing-dlq',
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // SQS Queue for essay processing
    const processingQueue = new sqs.Queue(this, 'EssayProcessingQueue', {
      queueName: 'vincent-vocab-essay-processing-queue',
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
      tableName: 'VincentVocabEssayMetrics',
      partitionKey: { name: 'essay_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // On-demand pricing for PoC
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For PoC - allows table deletion
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: false, // Can enable for production
      },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // DynamoDB Table for teachers (Epic 6)
    const teachersTable = new dynamodb.Table(this, 'Teachers', {
      tableName: 'VincentVocabTeachers',
      partitionKey: { name: 'teacher_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // IAM Role for API Lambda (will be used in Epic 2)
    const apiLambdaRole = new iam.Role(this, 'ApiLambdaRole', {
      roleName: 'vincent-vocab-api-lambda-role',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'IAM role for API Lambda function',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant permissions for API Lambda
    essaysBucket.grantReadWrite(apiLambdaRole);
    metricsTable.grantReadWriteData(apiLambdaRole);
    teachersTable.grantReadWriteData(apiLambdaRole);
    processingQueue.grantSendMessages(apiLambdaRole);

    // IAM Role for S3 Upload Lambda (will be used in Epic 2)
    // This Lambda will be triggered by S3 events and push to SQS
    const s3UploadLambdaRole = new iam.Role(this, 'S3UploadLambdaRole', {
      roleName: 'vincent-vocab-s3-upload-lambda-role',
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
      roleName: 'vincent-vocab-processor-lambda-role',
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

    // ============================================
    // Cognito User Pool (Epic 6) - Must be before API Lambda
    // ============================================

    // Cognito User Pool for teacher authentication
    const userPool = new cognito.UserPool(this, 'VocabTeachersPool', {
      userPoolName: 'vincent-vocab-teachers-pool',
      signInAliases: {
        email: true,
        username: false,
      },
      autoVerify: {
        email: true,
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For PoC
      mfa: cognito.Mfa.OFF, // No MFA for PoC
    });

    // Cognito User Pool Client for frontend
    const userPoolClient = new cognito.UserPoolClient(this, 'VocabTeachersPoolClient', {
      userPool,
      userPoolClientName: 'vincent-vocab-teachers-client',
      generateSecret: false, // Public client for frontend
      authFlows: {
        userPassword: true, // Allow username/password auth
        userSrp: true, // Allow SRP auth
      },
      preventUserExistenceErrors: true, // Security best practice
    });

    // Cognito User Pool Domain (for Hosted UI)
    const userPoolDomain = userPool.addDomain('VocabTeachersPoolDomain', {
      cognitoDomain: {
        domainPrefix: `vincent-vocab-${this.account}`, // Must be globally unique
      },
    });

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
      functionName: 'vincent-vocab-api-lambda',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'lambda_function.handler',
      code: apiLambdaCode,
      role: apiLambdaRole,
      timeout: cdk.Duration.seconds(30),
      environment: {
        ESSAYS_BUCKET: essaysBucket.bucketName,
        METRICS_TABLE: metricsTable.tableName,
        TEACHERS_TABLE: teachersTable.tableName,
        PROCESSING_QUEUE_URL: processingQueue.queueUrl,
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        COGNITO_REGION: this.region,
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
      functionName: 'vincent-vocab-s3-upload-lambda',
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
      restApiName: 'vincent-vocab-essay-analyzer-api',
      description: 'API for vocabulary essay analysis',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key'],
      },
    });

    // Cognito Authorizer for API Gateway
    const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
      authorizerName: 'vincent-vocab-cognito-authorizer',
      identitySource: 'method.request.header.Authorization',
    });

    // API Gateway Integration
    const apiIntegration = new apigateway.LambdaIntegration(apiLambda);

    // Health check endpoint (public, no auth required)
    const healthResource = api.root.addResource('health');
    healthResource.addMethod('GET', apiIntegration);

    // Auth endpoint (public, no auth required for /auth/health)
    const authResource = api.root.addResource('auth');
    const authHealthResource = authResource.addResource('health');
    authHealthResource.addMethod('GET', apiIntegration);

    // Protected endpoints (require Cognito authentication)
    const authorizerOptions = {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // POST /essay endpoint (protected)
    const essayResource = api.root.addResource('essay');
    essayResource.addMethod('POST', apiIntegration, authorizerOptions);

    // GET /essay/{essay_id} endpoint (protected)
    const essayIdResource = essayResource.addResource('{essay_id}');
    essayIdResource.addMethod('GET', apiIntegration, authorizerOptions);

    // Students endpoints (protected) - will be added in Epic 7
    const studentsResource = api.root.addResource('students');
    // Will add methods in Epic 7

    // Assignments endpoints (protected) - will be added in Epic 7
    const assignmentsResource = api.root.addResource('assignments');
    // Will add methods in Epic 7

    // Metrics endpoints (protected) - will be added in Epic 8
    const metricsResource = api.root.addResource('metrics');
    // Will add methods in Epic 8

    // Processor Lambda Function (Container Image)
    // Using container image instead of layer due to size limits (spaCy + model > 250MB)
    const processorLambda = new lambda.DockerImageFunction(this, 'ProcessorLambda', {
      functionName: 'vincent-vocab-processor-lambda',
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

    // ============================================
    // CloudWatch Observability (Epic 5)
    // ============================================

    // SNS Topic for alarm notifications (optional - can be configured later)
    const alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      displayName: 'vincent-vocab-essay-analyzer-alarms',
    });

    // CloudWatch Alarm: API Lambda Errors
    const apiLambdaErrorAlarm = new cloudwatch.Alarm(this, 'ApiLambdaErrorAlarm', {
      alarmName: 'vincent-vocab-api-lambda-errors',
      alarmDescription: 'Alerts when API Lambda errors exceed threshold',
      metric: apiLambda.metricErrors({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5, // Alert if 5+ errors in 5 minutes
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    apiLambdaErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // CloudWatch Alarm: S3 Upload Lambda Errors
    const s3UploadLambdaErrorAlarm = new cloudwatch.Alarm(this, 'S3UploadLambdaErrorAlarm', {
      alarmName: 'vincent-vocab-s3-upload-lambda-errors',
      alarmDescription: 'Alerts when S3 Upload Lambda errors exceed threshold',
      metric: s3UploadLambda.metricErrors({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5, // Alert if 5+ errors in 5 minutes
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    s3UploadLambdaErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // CloudWatch Alarm: Processor Lambda Errors
    const processorLambdaErrorAlarm = new cloudwatch.Alarm(this, 'ProcessorLambdaErrorAlarm', {
      alarmName: 'vincent-vocab-processor-lambda-errors',
      alarmDescription: 'Alerts when Processor Lambda errors exceed threshold',
      metric: processorLambda.metricErrors({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 3, // Alert if 3+ errors in 5 minutes (more critical)
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    processorLambdaErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // CloudWatch Alarm: Dead Letter Queue Messages (Failed Processing)
    const dlqAlarm = new cloudwatch.Alarm(this, 'DLQAlarm', {
      alarmName: 'vincent-vocab-dlq-messages',
      alarmDescription: 'Alerts when messages are sent to DLQ (processing failures)',
      metric: dlq.metricApproximateNumberOfMessagesVisible({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1, // Alert if any message in DLQ
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    dlqAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // CloudWatch Alarm: Processor Lambda Throttles (Optional)
    const processorLambdaThrottleAlarm = new cloudwatch.Alarm(this, 'ProcessorLambdaThrottleAlarm', {
      alarmName: 'vincent-vocab-processor-lambda-throttles',
      alarmDescription: 'Alerts when Processor Lambda is throttled',
      metric: processorLambda.metricThrottles({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1, // Alert if any throttles
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    processorLambdaThrottleAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // CloudWatch Alarm: Processor Lambda Duration (High Duration Warning)
    const processorLambdaDurationAlarm = new cloudwatch.Alarm(this, 'ProcessorLambdaDurationAlarm', {
      alarmName: 'vincent-vocab-processor-lambda-duration',
      alarmDescription: 'Alerts when Processor Lambda duration is high (approaching timeout)',
      metric: processorLambda.metricDuration({
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 240000, // 4 minutes (80% of 5-minute timeout)
      evaluationPeriods: 2, // Must exceed threshold for 2 periods
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    processorLambdaDurationAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

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

    new cdk.CfnOutput(this, 'TeachersTableName', {
      value: teachersTable.tableName,
      description: 'DynamoDB table name for teachers',
      exportName: 'TeachersTableName',
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

    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: alarmTopic.topicArn,
      description: 'SNS topic ARN for CloudWatch alarm notifications',
      exportName: 'AlarmTopicArn',
    });

    // ============================================
    // Cognito Outputs (Epic 6)
    // ============================================

    new cdk.CfnOutput(this, 'CognitoUserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID for teacher authentication',
      exportName: 'CognitoUserPoolId',
    });

    new cdk.CfnOutput(this, 'CognitoUserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID for frontend',
      exportName: 'CognitoUserPoolClientId',
    });

    new cdk.CfnOutput(this, 'CognitoRegion', {
      value: this.region,
      description: 'AWS region for Cognito',
      exportName: 'CognitoRegion',
    });

    new cdk.CfnOutput(this, 'CognitoHostedUiUrl', {
      value: `https://${userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`,
      description: 'Cognito Hosted UI URL',
      exportName: 'CognitoHostedUiUrl',
    });
  }
}

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
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

    // EssayUpdateQueue removed - no longer needed for async architecture

    // Legacy EssayMetrics table removed - replaced by Essays table

    // DynamoDB Table for teachers (Epic 6)
    const teachersTable = new dynamodb.Table(this, 'Teachers', {
      tableName: 'VincentVocabTeachers',
      partitionKey: { name: 'teacher_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // DynamoDB Table for students (Epic 7)
    const studentsTable = new dynamodb.Table(this, 'Students', {
      tableName: 'VincentVocabStudents',
      partitionKey: { name: 'teacher_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'student_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // DynamoDB Table for assignments (Epic 7)
    const assignmentsTable = new dynamodb.Table(this, 'Assignments', {
      tableName: 'VincentVocabAssignments',
      partitionKey: { name: 'teacher_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'assignment_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // Legacy ClassMetrics and StudentMetrics tables removed - metrics computed on-demand from Essays table

    // DynamoDB Table for Essays (new simplified schema)
    const essaysTable = new dynamodb.Table(this, 'Essays', {
      tableName: 'VincentVocabEssays',
      partitionKey: { name: 'assignment_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'essay_id', type: dynamodb.AttributeType.STRING },
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
    essaysBucket.grantReadWrite(apiLambdaRole); // Still used for presigned URLs (optional)
    teachersTable.grantReadWriteData(apiLambdaRole);
    studentsTable.grantReadWriteData(apiLambdaRole);
    assignmentsTable.grantReadWriteData(apiLambdaRole);
    essaysTable.grantReadWriteData(apiLambdaRole);
    processingQueue.grantSendMessages(apiLambdaRole);
    // Legacy metrics tables removed - no longer needed

    // S3 Upload Lambda and Processor Task Role removed
    // All processing now handled by Worker Lambda via SQS

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
              'pip install -r requirements.txt -t /asset-output && ' +
              'cp -r app lambda_function.py main.py pytest.ini /asset-output 2>/dev/null || true',
            ],
          },
          exclude: ['venv', '__pycache__', 'tests', '*.pyc', '*.pyo', '.pytest_cache'],
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
        ESSAYS_TABLE: essaysTable.tableName,
        STUDENTS_TABLE: studentsTable.tableName,
        ASSIGNMENTS_TABLE: assignmentsTable.tableName,
        ESSAY_PROCESSING_QUEUE_URL: processingQueue.queueUrl,
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        COGNITO_USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        COGNITO_REGION: this.region,
      },
    });

    // S3 Upload Trigger Lambda removed
    // All uploads now handled via API Lambda /essays/batch endpoint

    // API Gateway
    const api = new apigateway.RestApi(this, 'VocabApi', {
      restApiName: 'vincent-vocab-essay-analyzer-api',
      description: 'API for vocabulary essay analysis',
      defaultCorsPreflightOptions: {
        allowOrigins: [
          'https://vocab.vincentchan.cloud',
          'http://localhost:3000',
          'http://localhost:5173', // Vite default port
        ],
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key'],
        allowCredentials: true,
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

    // Legacy /essay endpoints removed - use /essays/batch and /essays/{essay_id} instead

    // Students endpoints (protected) - Epic 7
    const studentsResource = api.root.addResource('students');
    studentsResource.addMethod('POST', apiIntegration, authorizerOptions); // Create student
    studentsResource.addMethod('GET', apiIntegration, authorizerOptions); // List students
    const studentIdResource = studentsResource.addResource('{student_id}');
    studentIdResource.addMethod('GET', apiIntegration, authorizerOptions); // Get student
    studentIdResource.addMethod('PATCH', apiIntegration, authorizerOptions); // Update student
    studentIdResource.addMethod('DELETE', apiIntegration, authorizerOptions); // Delete student

    // Assignments endpoints (protected) - Epic 7
    const assignmentsResource = api.root.addResource('assignments');
    assignmentsResource.addMethod('POST', apiIntegration, authorizerOptions); // Create assignment
    assignmentsResource.addMethod('GET', apiIntegration, authorizerOptions); // List assignments
    const assignmentIdResource = assignmentsResource.addResource('{assignment_id}');
    assignmentIdResource.addMethod('GET', apiIntegration, authorizerOptions); // Get assignment
    const assignmentUploadResource = assignmentIdResource.addResource('upload-url');
    assignmentUploadResource.addMethod('POST', apiIntegration, authorizerOptions); // Get presigned upload URL

    // Metrics endpoints (protected) - Epic 8
    const metricsResource = api.root.addResource('metrics');
    const metricsClassResource = metricsResource.addResource('class');
    const metricsClassIdResource = metricsClassResource.addResource('{assignment_id}');
    metricsClassIdResource.addMethod('GET', apiIntegration, authorizerOptions); // Get class metrics
    const metricsStudentResource = metricsResource.addResource('student');
    const metricsStudentIdResource = metricsStudentResource.addResource('{student_id}');
    metricsStudentIdResource.addMethod('GET', apiIntegration, authorizerOptions); // Get student metrics

    // Essays endpoints
    const essaysResource = api.root.addResource('essays');
    const essaysBatchResource = essaysResource.addResource('batch');
    essaysBatchResource.addMethod('POST', apiIntegration, authorizerOptions); // POST /essays/batch - batch upload (protected)
    const essaysPublicResource = essaysResource.addResource('public');
    essaysPublicResource.addMethod('POST', apiIntegration); // POST /essays/public - public demo upload (no auth)
    // Specific routes must come before generic {essay_id} route to avoid conflicts
    const essaysAssignmentResource = essaysResource.addResource('assignment');
    const essaysAssignmentIdResource = essaysAssignmentResource.addResource('{assignment_id}');
    essaysAssignmentIdResource.addMethod('GET', apiIntegration, authorizerOptions); // GET /essays/assignment/{assignment_id} - list essays for assignment
    const essaysStudentResource = essaysResource.addResource('student');
    const essaysStudentIdResource = essaysStudentResource.addResource('{student_id}');
    essaysStudentIdResource.addMethod('GET', apiIntegration, authorizerOptions); // List essays for student
    const essayIdResourceOverride = essaysResource.addResource('{essay_id}');
    essayIdResourceOverride.addMethod('GET', apiIntegration); // GET /essays/{essay_id} - get essay (public for demo, protected for user essays)
    const essayOverrideResource = essayIdResourceOverride.addResource('override');
    essayOverrideResource.addMethod('PATCH', apiIntegration, authorizerOptions); // Override essay feedback

    // ECS, Aggregation Lambdas, and EssayUpdateQueue removed
    // All processing now handled by Worker Lambda via EssayProcessingQueue

    // ============================================
    // Worker Lambda (SQS-triggered essay processor)
    // ============================================

    // IAM Role for Worker Lambda
    const workerLambdaRole = new iam.Role(this, 'WorkerLambdaRole', {
      roleName: 'vincent-vocab-worker-lambda-role',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'IAM role for Worker Lambda function',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant permissions for Worker Lambda
    essaysTable.grantReadWriteData(workerLambdaRole);
    processingQueue.grantConsumeMessages(workerLambdaRole);

    // Worker Lambda Function
    const workerLambdaCode = process.env.CDK_SKIP_BUNDLING === 'true'
      ? lambda.Code.fromAsset(path.join(__dirname, '../lambda/worker'))
      : lambda.Code.fromAsset(path.join(__dirname, '../lambda/worker'), {
          bundling: {
            image: lambda.Runtime.PYTHON_3_12.bundlingImage,
            command: [
              'bash', '-c',
              'pip install -r requirements.txt -t /asset-output && ' +
              'cp -r lambda_function.py /asset-output 2>/dev/null || true',
            ],
          },
          exclude: ['__pycache__', '*.pyc', '*.pyo'],
        });

    const workerLambda = new lambda.Function(this, 'WorkerLambda', {
      functionName: 'vincent-vocab-worker-lambda',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'lambda_function.handler',
      code: workerLambdaCode,
      role: workerLambdaRole,
      timeout: cdk.Duration.minutes(5), // Must be >= SQS visibility timeout
      environment: {
        ESSAYS_TABLE: essaysTable.tableName,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
      },
    });

    // SQS Event Source for Worker Lambda
    workerLambda.addEventSource(
      new lambdaEventSources.SqsEventSource(processingQueue, {
        batchSize: 10, // Process up to 10 messages at a time
        maxBatchingWindow: cdk.Duration.seconds(30),
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

    // CloudWatch Alarm: Worker Lambda Errors
    const workerLambdaErrorAlarm = new cloudwatch.Alarm(this, 'WorkerLambdaErrorAlarm', {
      alarmName: 'vincent-vocab-worker-lambda-errors',
      alarmDescription: 'Alerts when Worker Lambda errors exceed threshold',
      metric: workerLambda.metricErrors({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5, // Alert if 5+ errors in 5 minutes
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    workerLambdaErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // CloudWatch Alarm: SQS Queue Depth
    const sqsQueueDepthAlarm = new cloudwatch.Alarm(this, 'SqsQueueDepthAlarm', {
      alarmName: 'vincent-vocab-processing-queue-depth',
      alarmDescription: 'Alerts when processing queue has more than 10 messages',
      metric: processingQueue.metricApproximateNumberOfMessagesVisible({
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    sqsQueueDepthAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // ECS-related alarms removed

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

    // Legacy MetricsTableName output removed - use EssaysTableName instead

    new cdk.CfnOutput(this, 'EssaysTableName', {
      value: essaysTable.tableName,
      description: 'DynamoDB table name for essays',
      exportName: 'EssaysTableName',
    });

    new cdk.CfnOutput(this, 'TeachersTableName', {
      value: teachersTable.tableName,
      description: 'DynamoDB table name for teachers',
      exportName: 'TeachersTableName',
    });

    new cdk.CfnOutput(this, 'StudentsTableName', {
      value: studentsTable.tableName,
      description: 'DynamoDB table name for students',
      exportName: 'StudentsTableName',
    });

    new cdk.CfnOutput(this, 'AssignmentsTableName', {
      value: assignmentsTable.tableName,
      description: 'DynamoDB table name for assignments',
      exportName: 'AssignmentsTableName',
    });

    // Legacy ClassMetricsTableName and StudentMetricsTableName outputs removed
    // Metrics are now computed on-demand from Essays table

    new cdk.CfnOutput(this, 'ApiLambdaRoleArn', {
      value: apiLambdaRole.roleArn,
      description: 'IAM role ARN for API Lambda',
      exportName: 'ApiLambdaRoleArn',
    });

    new cdk.CfnOutput(this, 'WorkerLambdaRoleArn', {
      value: workerLambdaRole.roleArn,
      description: 'IAM role ARN for Worker Lambda',
      exportName: 'WorkerLambdaRoleArn',
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway endpoint URL',
      exportName: 'ApiUrl',
    });

    // EssaysTableName output already defined above (line 422)

    new cdk.CfnOutput(this, 'WorkerLambdaFunctionName', {
      value: workerLambda.functionName,
      description: 'Worker Lambda function name',
      exportName: 'WorkerLambdaFunctionName',
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

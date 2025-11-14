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
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import * as logs from 'aws-cdk-lib/aws-logs';
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

    // SQS Queue for essay updates (triggers metric recalculation) - Epic 7
    const essayUpdateQueue = new sqs.Queue(this, 'EssayUpdateQueue', {
      queueName: 'vincent-vocab-essay-update-queue',
      visibilityTimeout: cdk.Duration.minutes(2),
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
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

    // DynamoDB Table for class metrics (Epic 7)
    const classMetricsTable = new dynamodb.Table(this, 'ClassMetrics', {
      tableName: 'VincentVocabClassMetrics',
      partitionKey: { name: 'teacher_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'assignment_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // StudentMetrics table for student-level rolling averages
    const studentMetricsTable = new dynamodb.Table(this, 'StudentMetrics', {
      tableName: 'VincentVocabStudentMetrics',
      partitionKey: { name: 'teacher_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'student_id', type: dynamodb.AttributeType.STRING },
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
    studentsTable.grantReadWriteData(apiLambdaRole);
    assignmentsTable.grantReadWriteData(apiLambdaRole);
    classMetricsTable.grantReadWriteData(apiLambdaRole);
    studentMetricsTable.grantReadWriteData(apiLambdaRole);
    processingQueue.grantSendMessages(apiLambdaRole);
    essayUpdateQueue.grantSendMessages(apiLambdaRole);

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

    // IAM Role for Processor ECS Task (replaces Processor Lambda)
    const processorTaskRole = new iam.Role(this, 'ProcessorTaskRole', {
      roleName: 'vincent-vocab-processor-task-role',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'IAM role for essay processor ECS task',
    });

    // Grant permissions for Processor ECS Task
    essaysBucket.grantRead(processorTaskRole);
    metricsTable.grantReadWriteData(processorTaskRole);
    studentsTable.grantReadData(processorTaskRole);
    assignmentsTable.grantReadData(processorTaskRole);
    classMetricsTable.grantReadWriteData(processorTaskRole);
    processingQueue.grantConsumeMessages(processorTaskRole);
    essayUpdateQueue.grantSendMessages(processorTaskRole);

    // Grant Bedrock permissions for Processor Task
    processorTaskRole.addToPolicy(
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
        METRICS_TABLE: metricsTable.tableName,
        TEACHERS_TABLE: teachersTable.tableName,
        STUDENTS_TABLE: studentsTable.tableName,
        ASSIGNMENTS_TABLE: assignmentsTable.tableName,
        CLASS_METRICS_TABLE: classMetricsTable.tableName,
        STUDENT_METRICS_TABLE: studentMetricsTable.tableName,
        PROCESSING_QUEUE_URL: processingQueue.queueUrl,
        ESSAY_UPDATE_QUEUE_URL: essayUpdateQueue.queueUrl,
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        COGNITO_USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        COGNITO_REGION: this.region,
        // OPENAI_API_KEY from environment variable (set during deployment)
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
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
              'pip install -r requirements.txt -t /asset-output && ' +
              'cp -r lambda_function.py name_extraction.py student_matching.py /asset-output 2>/dev/null || true',
            ],
          },
          exclude: ['__pycache__', 'tests', '*.pyc', '*.pyo', '.pytest_cache'],
        });
    
    const s3UploadLambda = new lambda.Function(this, 'S3UploadLambda', {
      functionName: 'vincent-vocab-s3-upload-lambda',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'lambda_function.handler',
      code: s3UploadLambdaCode,
      role: s3UploadLambdaRole,
      timeout: cdk.Duration.minutes(5), // Increased for zip extraction and name parsing
      memorySize: 512, // Increased for spaCy NER processing
      environment: {
        PROCESSING_QUEUE_URL: processingQueue.queueUrl,
        STUDENTS_TABLE: studentsTable.tableName,
        ASSIGNMENTS_TABLE: assignmentsTable.tableName,
        ESSAYS_BUCKET: essaysBucket.bucketName,
        METRICS_TABLE: metricsTable.tableName,
      },
    });

    // Grant additional permissions for S3 Upload Lambda (Epic 7)
    studentsTable.grantReadWriteData(s3UploadLambdaRole);
    assignmentsTable.grantReadData(s3UploadLambdaRole);
    metricsTable.grantReadData(s3UploadLambdaRole); // For reading teacher_id from legacy essays

    // S3 Event Notification - trigger Lambda on object creation
    // Process both essays/ prefix (single essays) and teacher_id/assignments/ prefix (batch uploads)
    essaysBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(s3UploadLambda)
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

    // POST /essay endpoint (public - legacy essay upload)
    const essayResource = api.root.addResource('essay');
    essayResource.addMethod('POST', apiIntegration); // No authorizer - public endpoint

    // GET /essay/{essay_id} endpoint (public - legacy essay retrieval)
    const essayIdResource = essayResource.addResource('{essay_id}');
    essayIdResource.addMethod('GET', apiIntegration); // No authorizer - public endpoint

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

    // Essays endpoints (protected) - Epic 8
    const essaysResource = api.root.addResource('essays');
    const essayIdResourceOverride = essaysResource.addResource('{essay_id}');
    const essayOverrideResource = essayIdResourceOverride.addResource('override');
    essayOverrideResource.addMethod('PATCH', apiIntegration, authorizerOptions); // Override essay feedback
    const essaysStudentResource = essaysResource.addResource('student');
    const essaysStudentIdResource = essaysStudentResource.addResource('{student_id}');
    essaysStudentIdResource.addMethod('GET', apiIntegration, authorizerOptions); // List essays for student

    // ============================================
    // ECS Fargate Worker Service (replaces Processor Lambda)
    // ============================================

    // Look up default VPC
    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVPC', {
      isDefault: true,
    });

    // Docker image asset for processor
    const processorImage = new ecr_assets.DockerImageAsset(this, 'ProcessorImage', {
      directory: path.join(__dirname, '../lambda/processor'),
    });

    // CloudWatch Log Group for ECS service
    const processorLogGroup = new logs.LogGroup(this, 'ProcessorLogGroup', {
      logGroupName: '/ecs/vocab-processor',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ECS Cluster
    const cluster = new ecs.Cluster(this, 'ProcessorCluster', {
      clusterName: 'vincent-vocab-processor-cluster',
      vpc,
    });

    // Fargate Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'ProcessorTaskDefinition', {
      cpu: 2048, // 2 vCPU
      memoryLimitMiB: 4096, // 4 GB
      taskRole: processorTaskRole,
    });

    // Add container to task definition
    const container = taskDefinition.addContainer('ProcessorContainer', {
      image: ecs.ContainerImage.fromDockerImageAsset(processorImage),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'processor',
        logGroup: processorLogGroup,
      }),
      environment: {
        PROCESSING_QUEUE_URL: processingQueue.queueUrl,
        METRICS_TABLE: metricsTable.tableName,
        ESSAYS_BUCKET: essaysBucket.bucketName,
        BEDROCK_MODEL_ID: 'anthropic.claude-3-sonnet-20240229-v1:0',
        ESSAY_UPDATE_QUEUE_URL: essayUpdateQueue.queueUrl,
        AWS_REGION: this.region,
      },
    });

    // Fargate Service
    const processorService = new ecs.FargateService(this, 'ProcessorService', {
      cluster,
      taskDefinition,
      desiredCount: 1,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      assignPublicIp: true,
      enableExecuteCommand: false,
      circuitBreaker: {
        enable: true,
        rollback: true,
      },
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    });

    // Auto Scaling
    const scaling = processorService.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 2,
    });

    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
    });

    // ============================================
    // Epic 7: Aggregation Lambda
    // ============================================

    // IAM Role for Aggregation Lambda
    const aggregationLambdaRole = new iam.Role(this, 'AggregationLambdaRole', {
      roleName: 'vincent-vocab-aggregation-lambda-role',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'IAM role for aggregation Lambda function',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant permissions for Aggregation Lambda
    metricsTable.grantReadData(aggregationLambdaRole);
    classMetricsTable.grantReadWriteData(aggregationLambdaRole);
    studentMetricsTable.grantReadWriteData(aggregationLambdaRole);
    essayUpdateQueue.grantConsumeMessages(aggregationLambdaRole);

    // Aggregation Lambda Function (for ClassMetrics)
    const aggregationLambdaCode = process.env.CDK_SKIP_BUNDLING === 'true'
      ? lambda.Code.fromAsset(path.join(__dirname, '../lambda/aggregations'))
      : lambda.Code.fromAsset(path.join(__dirname, '../lambda/aggregations'), {
          bundling: {
            image: lambda.Runtime.PYTHON_3_12.bundlingImage,
            command: [
              'bash', '-c',
              'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output',
            ],
          },
        });

    const aggregationLambda = new lambda.Function(this, 'AggregationLambda', {
      functionName: 'vincent-vocab-aggregation-lambda',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'class_metrics.handler',
      code: aggregationLambdaCode,
      role: aggregationLambdaRole,
      timeout: cdk.Duration.minutes(2),
      environment: {
        METRICS_TABLE: metricsTable.tableName,
        CLASS_METRICS_TABLE: classMetricsTable.tableName,
        STUDENT_METRICS_TABLE: studentMetricsTable.tableName,
      },
    });

    // SQS Event Source for Aggregation Lambda
    aggregationLambda.addEventSource(
      new lambdaEventSources.SqsEventSource(essayUpdateQueue, {
        batchSize: 10, // Process up to 10 updates at a time
        maxBatchingWindow: cdk.Duration.seconds(30),
      })
    );

    // Processor Task Role already has permission to send messages to EssayUpdateQueue
    // (granted above via essayUpdateQueue.grantSendMessages(processorTaskRole))

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

    // CloudWatch Alarm: ECS Service CPU Utilization
    const processorCpuAlarm = new cloudwatch.Alarm(this, 'ProcessorCpuAlarm', {
      alarmName: 'vincent-vocab-processor-cpu-high',
      alarmDescription: 'Alerts when ECS processor service CPU exceeds 85%',
      metric: processorService.metricCpuUtilization({
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 85,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    processorCpuAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

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

    // CloudWatch Alarm: ECS Service Running Task Count
    const processorTaskCountAlarm = new cloudwatch.Alarm(this, 'ProcessorTaskCountAlarm', {
      alarmName: 'vincent-vocab-processor-task-count-zero',
      alarmDescription: 'Alerts when ECS processor service has no running tasks',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ECS',
        metricName: 'RunningTaskCount',
        dimensionsMap: {
          ServiceName: processorService.serviceName,
          ClusterName: cluster.clusterName,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });
    processorTaskCountAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

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

    new cdk.CfnOutput(this, 'ClassMetricsTableName', {
      value: classMetricsTable.tableName,
      description: 'DynamoDB table name for class metrics',
      exportName: 'ClassMetricsTableName',
    });

    new cdk.CfnOutput(this, 'StudentMetricsTableName', {
      value: studentMetricsTable.tableName,
      description: 'DynamoDB table name for student metrics',
      exportName: 'StudentMetricsTableName',
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

    new cdk.CfnOutput(this, 'ProcessorTaskRoleArn', {
      value: processorTaskRole.roleArn,
      description: 'IAM role ARN for processor ECS task',
      exportName: 'ProcessorTaskRoleArn',
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway endpoint URL',
      exportName: 'ApiUrl',
    });

    new cdk.CfnOutput(this, 'ProcessorClusterName', {
      value: cluster.clusterName,
      description: 'ECS cluster name for processor service',
      exportName: 'ProcessorClusterName',
    });

    new cdk.CfnOutput(this, 'ProcessorServiceName', {
      value: processorService.serviceName,
      description: 'ECS service name for processor',
      exportName: 'ProcessorServiceName',
    });

    new cdk.CfnOutput(this, 'ProcessorImageUri', {
      value: processorImage.imageUri,
      description: 'ECR image URI for processor container',
      exportName: 'ProcessorImageUri',
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

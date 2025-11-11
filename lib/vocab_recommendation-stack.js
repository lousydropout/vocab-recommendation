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
exports.VocabRecommendationStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const sqs = __importStar(require("aws-cdk-lib/aws-sqs"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const apigateway = __importStar(require("aws-cdk-lib/aws-apigateway"));
const s3n = __importStar(require("aws-cdk-lib/aws-s3-notifications"));
const lambdaEventSources = __importStar(require("aws-cdk-lib/aws-lambda-event-sources"));
const cloudwatch = __importStar(require("aws-cdk-lib/aws-cloudwatch"));
const cloudwatchActions = __importStar(require("aws-cdk-lib/aws-cloudwatch-actions"));
const sns = __importStar(require("aws-cdk-lib/aws-sns"));
const cognito = __importStar(require("aws-cdk-lib/aws-cognito"));
const path = __importStar(require("path"));
class VocabRecommendationStack extends cdk.Stack {
    constructor(scope, id, props) {
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
        studentsTable.grantReadData(processorLambdaRole);
        assignmentsTable.grantReadData(processorLambdaRole);
        classMetricsTable.grantReadWriteData(processorLambdaRole);
        processingQueue.grantConsumeMessages(processorLambdaRole);
        // Grant Bedrock permissions for Processor Lambda
        processorLambdaRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['bedrock:InvokeModel'],
            resources: [
                `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-sonnet-*`,
                `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-haiku-*`,
                `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-opus-*`,
            ],
        }));
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
                STUDENTS_TABLE: studentsTable.tableName,
                ASSIGNMENTS_TABLE: assignmentsTable.tableName,
                CLASS_METRICS_TABLE: classMetricsTable.tableName,
                PROCESSING_QUEUE_URL: processingQueue.queueUrl,
                ESSAY_UPDATE_QUEUE_URL: essayUpdateQueue.queueUrl,
                COGNITO_USER_POOL_ID: userPool.userPoolId,
                COGNITO_USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
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
            timeout: cdk.Duration.minutes(5), // Increased for zip extraction and name parsing
            memorySize: 512, // Increased for spaCy NER processing
            environment: {
                PROCESSING_QUEUE_URL: processingQueue.queueUrl,
                STUDENTS_TABLE: studentsTable.tableName,
                ASSIGNMENTS_TABLE: assignmentsTable.tableName,
                ESSAYS_BUCKET: essaysBucket.bucketName,
            },
        });
        // Grant additional permissions for S3 Upload Lambda (Epic 7)
        studentsTable.grantReadWriteData(s3UploadLambdaRole);
        assignmentsTable.grantReadData(s3UploadLambdaRole);
        // S3 Event Notification - trigger Lambda on object creation
        // Process both essays/ prefix (single essays) and teacher_id/assignments/ prefix (batch uploads)
        essaysBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(s3UploadLambda));
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
        // Metrics endpoints (protected) - will be added in Epic 8
        const metricsResource = api.root.addResource('metrics');
        // Will add methods in Epic 8
        // Processor Lambda Function (Container Image)
        // Using container image instead of layer due to size limits (spaCy + model > 250MB)
        const processorLambda = new lambda.DockerImageFunction(this, 'ProcessorLambda', {
            functionName: 'vincent-vocab-processor-lambda',
            code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, '../lambda/processor'), {
            // Dockerfile is in lambda/processor/Dockerfile
            }),
            role: processorLambdaRole,
            timeout: cdk.Duration.minutes(5), // Must match SQS visibility timeout
            memorySize: 3008, // High memory for spaCy model loading
            environment: {
                ESSAYS_BUCKET: essaysBucket.bucketName,
                METRICS_TABLE: metricsTable.tableName,
                BEDROCK_MODEL_ID: 'anthropic.claude-3-sonnet-20240229-v1:0',
                ESSAY_UPDATE_QUEUE_URL: essayUpdateQueue.queueUrl,
                // AWS_REGION is automatically set by Lambda runtime
            },
        });
        // SQS Event Source for Processor Lambda
        processorLambda.addEventSource(new lambdaEventSources.SqsEventSource(processingQueue, {
            batchSize: 1, // Process one essay at a time
            maxBatchingWindow: cdk.Duration.seconds(0),
        }));
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
            },
        });
        // SQS Event Source for Aggregation Lambda
        aggregationLambda.addEventSource(new lambdaEventSources.SqsEventSource(essayUpdateQueue, {
            batchSize: 10, // Process up to 10 updates at a time
            maxBatchingWindow: cdk.Duration.seconds(30),
        }));
        // Grant Processor Lambda permission to send messages to EssayUpdateQueue
        processorLambdaRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['sqs:SendMessage'],
            resources: [essayUpdateQueue.queueArn],
        }));
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
exports.VocabRecommendationStack = VocabRecommendationStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidm9jYWJfcmVjb21tZW5kYXRpb24tc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2b2NhYl9yZWNvbW1lbmRhdGlvbi1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUVuQyx1REFBeUM7QUFDekMsbUVBQXFEO0FBQ3JELHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MsK0RBQWlEO0FBQ2pELHVFQUF5RDtBQUN6RCxzRUFBd0Q7QUFDeEQseUZBQTJFO0FBQzNFLHVFQUF5RDtBQUN6RCxzRkFBd0U7QUFDeEUseURBQTJDO0FBQzNDLGlFQUFtRDtBQUNuRCwyQ0FBNkI7QUFFN0IsTUFBYSx3QkFBeUIsU0FBUSxHQUFHLENBQUMsS0FBSztJQUNyRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLDhCQUE4QjtRQUM5QixNQUFNLFlBQVksR0FBRyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtZQUN2RCxVQUFVLEVBQUUsd0JBQXdCLElBQUksQ0FBQyxPQUFPLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRTtZQUNqRSxhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsbUNBQW1DO1lBQzdFLGlCQUFpQixFQUFFLElBQUksRUFBRSxxREFBcUQ7WUFDOUUsU0FBUyxFQUFFLEtBQUs7WUFDaEIsVUFBVSxFQUFFLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVO1lBQzFDLGlCQUFpQixFQUFFLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTO1lBQ2pELElBQUksRUFBRTtnQkFDSjtvQkFDRSxjQUFjLEVBQUUsQ0FBQyxHQUFHLENBQUM7b0JBQ3JCLGNBQWMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxXQUFXLENB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QUNuRixXQUFXLEVBQUUsdUJBQXVCO1lBQ3BDLFVBQVUsRUFBRSxvQkFBb0I7U0FDakMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBcm9CRCw0REFxb0JDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XG5pbXBvcnQgKiBhcyBzcXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNxcyc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcbmltcG9ydCAqIGFzIHMzbiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMtbm90aWZpY2F0aW9ucyc7XG5pbXBvcnQgKiBhcyBsYW1iZGFFdmVudFNvdXJjZXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYS1ldmVudC1zb3VyY2VzJztcbmltcG9ydCAqIGFzIGNsb3Vkd2F0Y2ggZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3Vkd2F0Y2gnO1xuaW1wb3J0ICogYXMgY2xvdWR3YXRjaEFjdGlvbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3Vkd2F0Y2gtYWN0aW9ucyc7XG5pbXBvcnQgKiBhcyBzbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNucyc7XG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2duaXRvJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5cbmV4cG9ydCBjbGFzcyBWb2NhYlJlY29tbWVuZGF0aW9uU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAvLyBTMyBCdWNrZXQgZm9yIGVzc2F5IHVwbG9hZHNcbiAgICBjb25zdCBlc3NheXNCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdFc3NheXNCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgdmluY2VudC12b2NhYi1lc3NheXMtJHt0aGlzLmFjY291bnR9LSR7dGhpcy5yZWdpb259YCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksIC8vIEZvciBQb0MgLSBhbGxvd3MgYnVja2V0IGRlbGV0aW9uXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSwgLy8gQXV0b21hdGljYWxseSBkZWxldGUgb2JqZWN0cyB3aGVuIHN0YWNrIGlzIGRlbGV0ZWRcbiAgICAgIHZlcnNpb25lZDogZmFsc2UsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgY29yczogW1xuICAgICAgICB7XG4gICAgICAgICAgYWxsb3dlZE9yaWdpbnM6IFsnKiddLFxuICAgICAgICAgIGFsbG93ZWRNZXRob2RzOiBbczMuSHR0cE1ldGhvZHMuR0VULCBzMy5IdHRwTWV0aG9kcy5QVVQsIHMzLkh0dHBNZXRob2RzLlBPU1RdLFxuICAgICAgICAgIGFsbG93ZWRIZWFkZXJzOiBbJyonXSxcbiAgICAgICAgICBtYXhBZ2U6IDM2MDAsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gU1FTIERlYWQgTGV0dGVyIFF1ZXVlXG4gICAgY29uc3QgZGxxID0gbmV3IHNxcy5RdWV1ZSh0aGlzLCAnUHJvY2Vzc2luZ0RMUScsIHtcbiAgICAgIHF1ZXVlTmFtZTogJ3ZpbmNlbnQtdm9jYWItZXNzYXktcHJvY2Vzc2luZy1kbHEnLFxuICAgICAgcmV0ZW50aW9uUGVyaW9kOiBjZGsuRHVyYXRpb24uZGF5cygxNCksXG4gICAgICBlbmNyeXB0aW9uOiBzcXMuUXVldWVFbmNyeXB0aW9uLlNRU19NQU5BR0VELFxuICAgIH0pO1xuXG4gICAgLy8gU1FTIFF1ZXVlIGZvciBlc3NheSBwcm9jZXNzaW5nXG4gICAgY29uc3QgcHJvY2Vzc2luZ1F1ZXVlID0gbmV3IHNxcy5RdWV1ZSh0aGlzLCAnRXNzYXlQcm9jZXNzaW5nUXVldWUnLCB7XG4gICAgICBxdWV1ZU5hbWU6ICd2aW5jZW50LXZvY2FiLWVzc2F5LXByb2Nlc3NpbmctcXVldWUnLFxuICAgICAgdmlzaWJpbGl0eVRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLCAvLyBNdXN0IGJlID49IExhbWJkYSB0aW1lb3V0XG4gICAgICByZXRlbnRpb25QZXJpb2Q6IGNkay5EdXJhdGlvbi5kYXlzKDE0KSxcbiAgICAgIGVuY3J5cHRpb246IHNxcy5RdWV1ZUVuY3J5cHRpb24uU1FTX01BTkFHRUQsXG4gICAgICBkZWFkTGV0dGVyUXVldWU6IHtcbiAgICAgICAgcXVldWU6IGRscSxcbiAgICAgICAgbWF4UmVjZWl2ZUNvdW50OiAzLCAvLyBSZXRyeSAzIHRpbWVzIGJlZm9yZSBzZW5kaW5nIHRvIERMUVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFNRUyBRdWV1ZSBmb3IgZXNzYXkgdXBkYXRlcyAodHJpZ2dlcnMgbWV0cmljIHJlY2FsY3VsYXRpb24pIC0gRXBpYyA3XG4gICAgY29uc3QgZXNzYXlVcGRhdGVRdWV1ZSA9IG5ldyBzcXMuUXVldWUodGhpcywgJ0Vzc2F5VXBkYXRlUXVldWUnLCB7XG4gICAgICBxdWV1ZU5hbWU6ICd2aW5jZW50LXZvY2FiLWVzc2F5LXVwZGF0ZS1xdWV1ZScsXG4gICAgICB2aXNpYmlsaXR5VGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMiksXG4gICAgICByZXRlbnRpb25QZXJpb2Q6IGNkay5EdXJhdGlvbi5kYXlzKDE0KSxcbiAgICAgIGVuY3J5cHRpb246IHNxcy5RdWV1ZUVuY3J5cHRpb24uU1FTX01BTkFHRUQsXG4gICAgfSk7XG5cbiAgICAvLyBEeW5hbW9EQiBUYWJsZSBmb3IgZXNzYXkgbWV0cmljc1xuICAgIGNvbnN0IG1ldHJpY3NUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnRXNzYXlNZXRyaWNzJywge1xuICAgICAgdGFibGVOYW1lOiAnVmluY2VudFZvY2FiRXNzYXlNZXRyaWNzJyxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAnZXNzYXlfaWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCwgLy8gT24tZGVtYW5kIHByaWNpbmcgZm9yIFBvQ1xuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSwgLy8gRm9yIFBvQyAtIGFsbG93cyB0YWJsZSBkZWxldGlvblxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHtcbiAgICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IGZhbHNlLCAvLyBDYW4gZW5hYmxlIGZvciBwcm9kdWN0aW9uXG4gICAgICB9LFxuICAgICAgZW5jcnlwdGlvbjogZHluYW1vZGIuVGFibGVFbmNyeXB0aW9uLkFXU19NQU5BR0VELFxuICAgIH0pO1xuXG4gICAgLy8gRHluYW1vREIgVGFibGUgZm9yIHRlYWNoZXJzIChFcGljIDYpXG4gICAgY29uc3QgdGVhY2hlcnNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnVGVhY2hlcnMnLCB7XG4gICAgICB0YWJsZU5hbWU6ICdWaW5jZW50Vm9jYWJUZWFjaGVycycsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ3RlYWNoZXJfaWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQVdTX01BTkFHRUQsXG4gICAgfSk7XG5cbiAgICAvLyBEeW5hbW9EQiBUYWJsZSBmb3Igc3R1ZGVudHMgKEVwaWMgNylcbiAgICBjb25zdCBzdHVkZW50c1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdTdHVkZW50cycsIHtcbiAgICAgIHRhYmxlTmFtZTogJ1ZpbmNlbnRWb2NhYlN0dWRlbnRzJyxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAndGVhY2hlcl9pZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICdzdHVkZW50X2lkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgZW5jcnlwdGlvbjogZHluYW1vZGIuVGFibGVFbmNyeXB0aW9uLkFXU19NQU5BR0VELFxuICAgIH0pO1xuXG4gICAgLy8gRHluYW1vREIgVGFibGUgZm9yIGFzc2lnbm1lbnRzIChFcGljIDcpXG4gICAgY29uc3QgYXNzaWdubWVudHNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnQXNzaWdubWVudHMnLCB7XG4gICAgICB0YWJsZU5hbWU6ICdWaW5jZW50Vm9jYWJBc3NpZ25tZW50cycsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ3RlYWNoZXJfaWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiAnYXNzaWdubWVudF9pZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGVuY3J5cHRpb246IGR5bmFtb2RiLlRhYmxlRW5jcnlwdGlvbi5BV1NfTUFOQUdFRCxcbiAgICB9KTtcblxuICAgIC8vIER5bmFtb0RCIFRhYmxlIGZvciBjbGFzcyBtZXRyaWNzIChFcGljIDcpXG4gICAgY29uc3QgY2xhc3NNZXRyaWNzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ0NsYXNzTWV0cmljcycsIHtcbiAgICAgIHRhYmxlTmFtZTogJ1ZpbmNlbnRWb2NhYkNsYXNzTWV0cmljcycsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ3RlYWNoZXJfaWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiAnYXNzaWdubWVudF9pZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGVuY3J5cHRpb246IGR5bmFtb2RiLlRhYmxlRW5jcnlwdGlvbi5BV1NfTUFOQUdFRCxcbiAgICB9KTtcblxuICAgIC8vIElBTSBSb2xlIGZvciBBUEkgTGFtYmRhICh3aWxsIGJlIHVzZWQgaW4gRXBpYyAyKVxuICAgIGNvbnN0IGFwaUxhbWJkYVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0FwaUxhbWJkYVJvbGUnLCB7XG4gICAgICByb2xlTmFtZTogJ3ZpbmNlbnQtdm9jYWItYXBpLWxhbWJkYS1yb2xlJyxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgZGVzY3JpcHRpb246ICdJQU0gcm9sZSBmb3IgQVBJIExhbWJkYSBmdW5jdGlvbicsXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJyksXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgcGVybWlzc2lvbnMgZm9yIEFQSSBMYW1iZGFcbiAgICBlc3NheXNCdWNrZXQuZ3JhbnRSZWFkV3JpdGUoYXBpTGFtYmRhUm9sZSk7XG4gICAgbWV0cmljc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShhcGlMYW1iZGFSb2xlKTtcbiAgICB0ZWFjaGVyc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShhcGlMYW1iZGFSb2xlKTtcbiAgICBzdHVkZW50c1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShhcGlMYW1iZGFSb2xlKTtcbiAgICBhc3NpZ25tZW50c1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShhcGlMYW1iZGFSb2xlKTtcbiAgICBjbGFzc01ldHJpY3NUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoYXBpTGFtYmRhUm9sZSk7XG4gICAgcHJvY2Vzc2luZ1F1ZXVlLmdyYW50U2VuZE1lc3NhZ2VzKGFwaUxhbWJkYVJvbGUpO1xuICAgIGVzc2F5VXBkYXRlUXVldWUuZ3JhbnRTZW5kTWVzc2FnZXMoYXBpTGFtYmRhUm9sZSk7XG5cbiAgICAvLyBJQU0gUm9sZSBmb3IgUzMgVXBsb2FkIExhbWJkYSAod2lsbCBiZSB1c2VkIGluIEVwaWMgMilcbiAgICAvLyBUaGlzIExhbWJkYSB3aWxsIGJlIHRyaWdnZXJlZCBieSBTMyBldmVudHMgYW5kIHB1c2ggdG8gU1FTXG4gICAgY29uc3QgczNVcGxvYWRMYW1iZGFSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdTM1VwbG9hZExhbWJkYVJvbGUnLCB7XG4gICAgICByb2xlTmFtZTogJ3ZpbmNlbnQtdm9jYWItczMtdXBsb2FkLWxhbWJkYS1yb2xlJyxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgZGVzY3JpcHRpb246ICdJQU0gcm9sZSBmb3IgUzMgdXBsb2FkIHRyaWdnZXIgTGFtYmRhIGZ1bmN0aW9uJyxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnKSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBwZXJtaXNzaW9ucyBmb3IgUzMgVXBsb2FkIExhbWJkYVxuICAgIGVzc2F5c0J1Y2tldC5ncmFudFJlYWQoczNVcGxvYWRMYW1iZGFSb2xlKTtcbiAgICBwcm9jZXNzaW5nUXVldWUuZ3JhbnRTZW5kTWVzc2FnZXMoczNVcGxvYWRMYW1iZGFSb2xlKTtcblxuICAgIC8vIElBTSBSb2xlIGZvciBQcm9jZXNzb3IgTGFtYmRhICh3aWxsIGJlIHVzZWQgaW4gRXBpYyAzKVxuICAgIGNvbnN0IHByb2Nlc3NvckxhbWJkYVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1Byb2Nlc3NvckxhbWJkYVJvbGUnLCB7XG4gICAgICByb2xlTmFtZTogJ3ZpbmNlbnQtdm9jYWItcHJvY2Vzc29yLWxhbWJkYS1yb2xlJyxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgZGVzY3JpcHRpb246ICdJQU0gcm9sZSBmb3IgZXNzYXkgcHJvY2Vzc29yIExhbWJkYSBmdW5jdGlvbicsXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJyksXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgcGVybWlzc2lvbnMgZm9yIFByb2Nlc3NvciBMYW1iZGFcbiAgICBlc3NheXNCdWNrZXQuZ3JhbnRSZWFkKHByb2Nlc3NvckxhbWJkYVJvbGUpO1xuICAgIG1ldHJpY3NUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEocHJvY2Vzc29yTGFtYmRhUm9sZSk7XG4gICAgc3R1ZGVudHNUYWJsZS5ncmFudFJlYWREYXRhKHByb2Nlc3NvckxhbWJkYVJvbGUpO1xuICAgIGFzc2lnbm1lbnRzVGFibGUuZ3JhbnRSZWFkRGF0YShwcm9jZXNzb3JMYW1iZGFSb2xlKTtcbiAgICBjbGFzc01ldHJpY3NUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEocHJvY2Vzc29yTGFtYmRhUm9sZSk7XG4gICAgcHJvY2Vzc2luZ1F1ZXVlLmdyYW50Q29uc3VtZU1lc3NhZ2VzKHByb2Nlc3NvckxhbWJkYVJvbGUpO1xuXG4gICAgLy8gR3JhbnQgQmVkcm9jayBwZXJtaXNzaW9ucyBmb3IgUHJvY2Vzc29yIExhbWJkYVxuICAgIHByb2Nlc3NvckxhbWJkYVJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogWydiZWRyb2NrOkludm9rZU1vZGVsJ10sXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIGBhcm46YXdzOmJlZHJvY2s6JHt0aGlzLnJlZ2lvbn06OmZvdW5kYXRpb24tbW9kZWwvYW50aHJvcGljLmNsYXVkZS0zLXNvbm5ldC0qYCxcbiAgICAgICAgICBgYXJuOmF3czpiZWRyb2NrOiR7dGhpcy5yZWdpb259Ojpmb3VuZGF0aW9uLW1vZGVsL2FudGhyb3BpYy5jbGF1ZGUtMy1oYWlrdS0qYCxcbiAgICAgICAgICBgYXJuOmF3czpiZWRyb2NrOiR7dGhpcy5yZWdpb259Ojpmb3VuZGF0aW9uLW1vZGVsL2FudGhyb3BpYy5jbGF1ZGUtMy1vcHVzLSpgLFxuICAgICAgICBdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBDb2duaXRvIFVzZXIgUG9vbCAoRXBpYyA2KSAtIE11c3QgYmUgYmVmb3JlIEFQSSBMYW1iZGFcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gQ29nbml0byBVc2VyIFBvb2wgZm9yIHRlYWNoZXIgYXV0aGVudGljYXRpb25cbiAgICBjb25zdCB1c2VyUG9vbCA9IG5ldyBjb2duaXRvLlVzZXJQb29sKHRoaXMsICdWb2NhYlRlYWNoZXJzUG9vbCcsIHtcbiAgICAgIHVzZXJQb29sTmFtZTogJ3ZpbmNlbnQtdm9jYWItdGVhY2hlcnMtcG9vbCcsXG4gICAgICBzaWduSW5BbGlhc2VzOiB7XG4gICAgICAgIGVtYWlsOiB0cnVlLFxuICAgICAgICB1c2VybmFtZTogZmFsc2UsXG4gICAgICB9LFxuICAgICAgYXV0b1ZlcmlmeToge1xuICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBwYXNzd29yZFBvbGljeToge1xuICAgICAgICBtaW5MZW5ndGg6IDgsXG4gICAgICAgIHJlcXVpcmVMb3dlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVVcHBlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVEaWdpdHM6IHRydWUsXG4gICAgICAgIHJlcXVpcmVTeW1ib2xzOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLCAvLyBGb3IgUG9DXG4gICAgICBtZmE6IGNvZ25pdG8uTWZhLk9GRiwgLy8gTm8gTUZBIGZvciBQb0NcbiAgICB9KTtcblxuICAgIC8vIENvZ25pdG8gVXNlciBQb29sIENsaWVudCBmb3IgZnJvbnRlbmRcbiAgICBjb25zdCB1c2VyUG9vbENsaWVudCA9IG5ldyBjb2duaXRvLlVzZXJQb29sQ2xpZW50KHRoaXMsICdWb2NhYlRlYWNoZXJzUG9vbENsaWVudCcsIHtcbiAgICAgIHVzZXJQb29sLFxuICAgICAgdXNlclBvb2xDbGllbnROYW1lOiAndmluY2VudC12b2NhYi10ZWFjaGVycy1jbGllbnQnLFxuICAgICAgZ2VuZXJhdGVTZWNyZXQ6IGZhbHNlLCAvLyBQdWJsaWMgY2xpZW50IGZvciBmcm9udGVuZFxuICAgICAgYXV0aEZsb3dzOiB7XG4gICAgICAgIHVzZXJQYXNzd29yZDogdHJ1ZSwgLy8gQWxsb3cgdXNlcm5hbWUvcGFzc3dvcmQgYXV0aFxuICAgICAgICB1c2VyU3JwOiB0cnVlLCAvLyBBbGxvdyBTUlAgYXV0aFxuICAgICAgfSxcbiAgICAgIHByZXZlbnRVc2VyRXhpc3RlbmNlRXJyb3JzOiB0cnVlLCAvLyBTZWN1cml0eSBiZXN0IHByYWN0aWNlXG4gICAgfSk7XG5cbiAgICAvLyBDb2duaXRvIFVzZXIgUG9vbCBEb21haW4gKGZvciBIb3N0ZWQgVUkpXG4gICAgY29uc3QgdXNlclBvb2xEb21haW4gPSB1c2VyUG9vbC5hZGREb21haW4oJ1ZvY2FiVGVhY2hlcnNQb29sRG9tYWluJywge1xuICAgICAgY29nbml0b0RvbWFpbjoge1xuICAgICAgICBkb21haW5QcmVmaXg6IGB2aW5jZW50LXZvY2FiLSR7dGhpcy5hY2NvdW50fWAsIC8vIE11c3QgYmUgZ2xvYmFsbHkgdW5pcXVlXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQVBJIExhbWJkYSBGdW5jdGlvblxuICAgIC8vIFNraXAgYnVuZGxpbmcgaW4gdGVzdCBlbnZpcm9ubWVudCAoRG9ja2VyIG5vdCBhdmFpbGFibGUpXG4gICAgY29uc3QgYXBpTGFtYmRhQ29kZSA9IHByb2Nlc3MuZW52LkNES19TS0lQX0JVTkRMSU5HID09PSAndHJ1ZSdcbiAgICAgID8gbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGEvYXBpJykpXG4gICAgICA6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhL2FwaScpLCB7XG4gICAgICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgICAgIGltYWdlOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMi5idW5kbGluZ0ltYWdlLFxuICAgICAgICAgICAgY29tbWFuZDogW1xuICAgICAgICAgICAgICAnYmFzaCcsICctYycsXG4gICAgICAgICAgICAgICdwaXAgaW5zdGFsbCAtciByZXF1aXJlbWVudHMudHh0IC10IC9hc3NldC1vdXRwdXQgJiYgY3AgLWF1IC4gL2Fzc2V0LW91dHB1dCcsXG4gICAgICAgICAgICBdLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuICAgIFxuICAgIGNvbnN0IGFwaUxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0FwaUxhbWJkYScsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ3ZpbmNlbnQtdm9jYWItYXBpLWxhbWJkYScsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMixcbiAgICAgIGhhbmRsZXI6ICdsYW1iZGFfZnVuY3Rpb24uaGFuZGxlcicsXG4gICAgICBjb2RlOiBhcGlMYW1iZGFDb2RlLFxuICAgICAgcm9sZTogYXBpTGFtYmRhUm9sZSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEVTU0FZU19CVUNLRVQ6IGVzc2F5c0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICBNRVRSSUNTX1RBQkxFOiBtZXRyaWNzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBURUFDSEVSU19UQUJMRTogdGVhY2hlcnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIFNUVURFTlRTX1RBQkxFOiBzdHVkZW50c1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgQVNTSUdOTUVOVFNfVEFCTEU6IGFzc2lnbm1lbnRzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBDTEFTU19NRVRSSUNTX1RBQkxFOiBjbGFzc01ldHJpY3NUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIFBST0NFU1NJTkdfUVVFVUVfVVJMOiBwcm9jZXNzaW5nUXVldWUucXVldWVVcmwsXG4gICAgICAgIEVTU0FZX1VQREFURV9RVUVVRV9VUkw6IGVzc2F5VXBkYXRlUXVldWUucXVldWVVcmwsXG4gICAgICAgIENPR05JVE9fVVNFUl9QT09MX0lEOiB1c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgICBDT0dOSVRPX1VTRVJfUE9PTF9DTElFTlRfSUQ6IHVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICAgIENPR05JVE9fUkVHSU9OOiB0aGlzLnJlZ2lvbixcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBTMyBVcGxvYWQgVHJpZ2dlciBMYW1iZGEgRnVuY3Rpb25cbiAgICAvLyBTa2lwIGJ1bmRsaW5nIGluIHRlc3QgZW52aXJvbm1lbnQgKERvY2tlciBub3QgYXZhaWxhYmxlKVxuICAgIGNvbnN0IHMzVXBsb2FkTGFtYmRhQ29kZSA9IHByb2Nlc3MuZW52LkNES19TS0lQX0JVTkRMSU5HID09PSAndHJ1ZSdcbiAgICAgID8gbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGEvczNfdXBsb2FkX3RyaWdnZXInKSlcbiAgICAgIDogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGEvczNfdXBsb2FkX3RyaWdnZXInKSwge1xuICAgICAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgICAgICBpbWFnZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTIuYnVuZGxpbmdJbWFnZSxcbiAgICAgICAgICAgIGNvbW1hbmQ6IFtcbiAgICAgICAgICAgICAgJ2Jhc2gnLCAnLWMnLFxuICAgICAgICAgICAgICAncGlwIGluc3RhbGwgLXIgcmVxdWlyZW1lbnRzLnR4dCAtdCAvYXNzZXQtb3V0cHV0ICYmIGNwIC1hdSAuIC9hc3NldC1vdXRwdXQnLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICBcbiAgICBjb25zdCBzM1VwbG9hZExhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1MzVXBsb2FkTGFtYmRhJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiAndmluY2VudC12b2NhYi1zMy11cGxvYWQtbGFtYmRhJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzEyLFxuICAgICAgaGFuZGxlcjogJ2xhbWJkYV9mdW5jdGlvbi5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IHMzVXBsb2FkTGFtYmRhQ29kZSxcbiAgICAgIHJvbGU6IHMzVXBsb2FkTGFtYmRhUm9sZSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLCAvLyBJbmNyZWFzZWQgZm9yIHppcCBleHRyYWN0aW9uIGFuZCBuYW1lIHBhcnNpbmdcbiAgICAgIG1lbW9yeVNpemU6IDUxMiwgLy8gSW5jcmVhc2VkIGZvciBzcGFDeSBORVIgcHJvY2Vzc2luZ1xuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUFJPQ0VTU0lOR19RVUVVRV9VUkw6IHByb2Nlc3NpbmdRdWV1ZS5xdWV1ZVVybCxcbiAgICAgICAgU1RVREVOVFNfVEFCTEU6IHN0dWRlbnRzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBBU1NJR05NRU5UU19UQUJMRTogYXNzaWdubWVudHNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIEVTU0FZU19CVUNLRVQ6IGVzc2F5c0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IGFkZGl0aW9uYWwgcGVybWlzc2lvbnMgZm9yIFMzIFVwbG9hZCBMYW1iZGEgKEVwaWMgNylcbiAgICBzdHVkZW50c1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShzM1VwbG9hZExhbWJkYVJvbGUpO1xuICAgIGFzc2lnbm1lbnRzVGFibGUuZ3JhbnRSZWFkRGF0YShzM1VwbG9hZExhbWJkYVJvbGUpO1xuXG4gICAgLy8gUzMgRXZlbnQgTm90aWZpY2F0aW9uIC0gdHJpZ2dlciBMYW1iZGEgb24gb2JqZWN0IGNyZWF0aW9uXG4gICAgLy8gUHJvY2VzcyBib3RoIGVzc2F5cy8gcHJlZml4IChzaW5nbGUgZXNzYXlzKSBhbmQgdGVhY2hlcl9pZC9hc3NpZ25tZW50cy8gcHJlZml4IChiYXRjaCB1cGxvYWRzKVxuICAgIGVzc2F5c0J1Y2tldC5hZGRFdmVudE5vdGlmaWNhdGlvbihcbiAgICAgIHMzLkV2ZW50VHlwZS5PQkpFQ1RfQ1JFQVRFRCxcbiAgICAgIG5ldyBzM24uTGFtYmRhRGVzdGluYXRpb24oczNVcGxvYWRMYW1iZGEpXG4gICAgKTtcblxuICAgIC8vIEFQSSBHYXRld2F5XG4gICAgY29uc3QgYXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCAnVm9jYWJBcGknLCB7XG4gICAgICByZXN0QXBpTmFtZTogJ3ZpbmNlbnQtdm9jYWItZXNzYXktYW5hbHl6ZXItYXBpJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIGZvciB2b2NhYnVsYXJ5IGVzc2F5IGFuYWx5c2lzJyxcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xuICAgICAgICBhbGxvd09yaWdpbnM6IGFwaWdhdGV3YXkuQ29ycy5BTExfT1JJR0lOUyxcbiAgICAgICAgYWxsb3dNZXRob2RzOiBhcGlnYXRld2F5LkNvcnMuQUxMX01FVEhPRFMsXG4gICAgICAgIGFsbG93SGVhZGVyczogWydDb250ZW50LVR5cGUnLCAnWC1BbXotRGF0ZScsICdBdXRob3JpemF0aW9uJywgJ1gtQXBpLUtleSddLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENvZ25pdG8gQXV0aG9yaXplciBmb3IgQVBJIEdhdGV3YXlcbiAgICBjb25zdCBjb2duaXRvQXV0aG9yaXplciA9IG5ldyBhcGlnYXRld2F5LkNvZ25pdG9Vc2VyUG9vbHNBdXRob3JpemVyKHRoaXMsICdDb2duaXRvQXV0aG9yaXplcicsIHtcbiAgICAgIGNvZ25pdG9Vc2VyUG9vbHM6IFt1c2VyUG9vbF0sXG4gICAgICBhdXRob3JpemVyTmFtZTogJ3ZpbmNlbnQtdm9jYWItY29nbml0by1hdXRob3JpemVyJyxcbiAgICAgIGlkZW50aXR5U291cmNlOiAnbWV0aG9kLnJlcXVlc3QuaGVhZGVyLkF1dGhvcml6YXRpb24nLFxuICAgIH0pO1xuXG4gICAgLy8gQVBJIEdhdGV3YXkgSW50ZWdyYXRpb25cbiAgICBjb25zdCBhcGlJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGFwaUxhbWJkYSk7XG5cbiAgICAvLyBIZWFsdGggY2hlY2sgZW5kcG9pbnQgKHB1YmxpYywgbm8gYXV0aCByZXF1aXJlZClcbiAgICBjb25zdCBoZWFsdGhSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdoZWFsdGgnKTtcbiAgICBoZWFsdGhSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIGFwaUludGVncmF0aW9uKTtcblxuICAgIC8vIEF1dGggZW5kcG9pbnQgKHB1YmxpYywgbm8gYXV0aCByZXF1aXJlZCBmb3IgL2F1dGgvaGVhbHRoKVxuICAgIGNvbnN0IGF1dGhSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdhdXRoJyk7XG4gICAgY29uc3QgYXV0aEhlYWx0aFJlc291cmNlID0gYXV0aFJlc291cmNlLmFkZFJlc291cmNlKCdoZWFsdGgnKTtcbiAgICBhdXRoSGVhbHRoUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBhcGlJbnRlZ3JhdGlvbik7XG5cbiAgICAvLyBQcm90ZWN0ZWQgZW5kcG9pbnRzIChyZXF1aXJlIENvZ25pdG8gYXV0aGVudGljYXRpb24pXG4gICAgY29uc3QgYXV0aG9yaXplck9wdGlvbnMgPSB7XG4gICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfTtcblxuICAgIC8vIFBPU1QgL2Vzc2F5IGVuZHBvaW50IChwcm90ZWN0ZWQpXG4gICAgY29uc3QgZXNzYXlSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdlc3NheScpO1xuICAgIGVzc2F5UmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgYXBpSW50ZWdyYXRpb24sIGF1dGhvcml6ZXJPcHRpb25zKTtcblxuICAgIC8vIEdFVCAvZXNzYXkve2Vzc2F5X2lkfSBlbmRwb2ludCAocHJvdGVjdGVkKVxuICAgIGNvbnN0IGVzc2F5SWRSZXNvdXJjZSA9IGVzc2F5UmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3tlc3NheV9pZH0nKTtcbiAgICBlc3NheUlkUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBhcGlJbnRlZ3JhdGlvbiwgYXV0aG9yaXplck9wdGlvbnMpO1xuXG4gICAgLy8gU3R1ZGVudHMgZW5kcG9pbnRzIChwcm90ZWN0ZWQpIC0gRXBpYyA3XG4gICAgY29uc3Qgc3R1ZGVudHNSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdzdHVkZW50cycpO1xuICAgIHN0dWRlbnRzUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgYXBpSW50ZWdyYXRpb24sIGF1dGhvcml6ZXJPcHRpb25zKTsgLy8gQ3JlYXRlIHN0dWRlbnRcbiAgICBzdHVkZW50c1Jlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgYXBpSW50ZWdyYXRpb24sIGF1dGhvcml6ZXJPcHRpb25zKTsgLy8gTGlzdCBzdHVkZW50c1xuICAgIGNvbnN0IHN0dWRlbnRJZFJlc291cmNlID0gc3R1ZGVudHNSZXNvdXJjZS5hZGRSZXNvdXJjZSgne3N0dWRlbnRfaWR9Jyk7XG4gICAgc3R1ZGVudElkUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBhcGlJbnRlZ3JhdGlvbiwgYXV0aG9yaXplck9wdGlvbnMpOyAvLyBHZXQgc3R1ZGVudFxuICAgIHN0dWRlbnRJZFJlc291cmNlLmFkZE1ldGhvZCgnUEFUQ0gnLCBhcGlJbnRlZ3JhdGlvbiwgYXV0aG9yaXplck9wdGlvbnMpOyAvLyBVcGRhdGUgc3R1ZGVudFxuICAgIHN0dWRlbnRJZFJlc291cmNlLmFkZE1ldGhvZCgnREVMRVRFJywgYXBpSW50ZWdyYXRpb24sIGF1dGhvcml6ZXJPcHRpb25zKTsgLy8gRGVsZXRlIHN0dWRlbnRcblxuICAgIC8vIEFzc2lnbm1lbnRzIGVuZHBvaW50cyAocHJvdGVjdGVkKSAtIEVwaWMgN1xuICAgIGNvbnN0IGFzc2lnbm1lbnRzUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnYXNzaWdubWVudHMnKTtcbiAgICBhc3NpZ25tZW50c1Jlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIGFwaUludGVncmF0aW9uLCBhdXRob3JpemVyT3B0aW9ucyk7IC8vIENyZWF0ZSBhc3NpZ25tZW50XG4gICAgYXNzaWdubWVudHNSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIGFwaUludGVncmF0aW9uLCBhdXRob3JpemVyT3B0aW9ucyk7IC8vIExpc3QgYXNzaWdubWVudHNcbiAgICBjb25zdCBhc3NpZ25tZW50SWRSZXNvdXJjZSA9IGFzc2lnbm1lbnRzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3thc3NpZ25tZW50X2lkfScpO1xuICAgIGFzc2lnbm1lbnRJZFJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgYXBpSW50ZWdyYXRpb24sIGF1dGhvcml6ZXJPcHRpb25zKTsgLy8gR2V0IGFzc2lnbm1lbnRcbiAgICBjb25zdCBhc3NpZ25tZW50VXBsb2FkUmVzb3VyY2UgPSBhc3NpZ25tZW50SWRSZXNvdXJjZS5hZGRSZXNvdXJjZSgndXBsb2FkLXVybCcpO1xuICAgIGFzc2lnbm1lbnRVcGxvYWRSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBhcGlJbnRlZ3JhdGlvbiwgYXV0aG9yaXplck9wdGlvbnMpOyAvLyBHZXQgcHJlc2lnbmVkIHVwbG9hZCBVUkxcblxuICAgIC8vIE1ldHJpY3MgZW5kcG9pbnRzIChwcm90ZWN0ZWQpIC0gd2lsbCBiZSBhZGRlZCBpbiBFcGljIDhcbiAgICBjb25zdCBtZXRyaWNzUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnbWV0cmljcycpO1xuICAgIC8vIFdpbGwgYWRkIG1ldGhvZHMgaW4gRXBpYyA4XG5cbiAgICAvLyBQcm9jZXNzb3IgTGFtYmRhIEZ1bmN0aW9uIChDb250YWluZXIgSW1hZ2UpXG4gICAgLy8gVXNpbmcgY29udGFpbmVyIGltYWdlIGluc3RlYWQgb2YgbGF5ZXIgZHVlIHRvIHNpemUgbGltaXRzIChzcGFDeSArIG1vZGVsID4gMjUwTUIpXG4gICAgY29uc3QgcHJvY2Vzc29yTGFtYmRhID0gbmV3IGxhbWJkYS5Eb2NrZXJJbWFnZUZ1bmN0aW9uKHRoaXMsICdQcm9jZXNzb3JMYW1iZGEnLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6ICd2aW5jZW50LXZvY2FiLXByb2Nlc3Nvci1sYW1iZGEnLFxuICAgICAgY29kZTogbGFtYmRhLkRvY2tlckltYWdlQ29kZS5mcm9tSW1hZ2VBc3NldChcbiAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYS9wcm9jZXNzb3InKSxcbiAgICAgICAge1xuICAgICAgICAgIC8vIERvY2tlcmZpbGUgaXMgaW4gbGFtYmRhL3Byb2Nlc3Nvci9Eb2NrZXJmaWxlXG4gICAgICAgIH1cbiAgICAgICksXG4gICAgICByb2xlOiBwcm9jZXNzb3JMYW1iZGFSb2xlLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksIC8vIE11c3QgbWF0Y2ggU1FTIHZpc2liaWxpdHkgdGltZW91dFxuICAgICAgbWVtb3J5U2l6ZTogMzAwOCwgLy8gSGlnaCBtZW1vcnkgZm9yIHNwYUN5IG1vZGVsIGxvYWRpbmdcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEVTU0FZU19CVUNLRVQ6IGVzc2F5c0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICBNRVRSSUNTX1RBQkxFOiBtZXRyaWNzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBCRURST0NLX01PREVMX0lEOiAnYW50aHJvcGljLmNsYXVkZS0zLXNvbm5ldC0yMDI0MDIyOS12MTowJyxcbiAgICAgICAgRVNTQVlfVVBEQVRFX1FVRVVFX1VSTDogZXNzYXlVcGRhdGVRdWV1ZS5xdWV1ZVVybCxcbiAgICAgICAgLy8gQVdTX1JFR0lPTiBpcyBhdXRvbWF0aWNhbGx5IHNldCBieSBMYW1iZGEgcnVudGltZVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFNRUyBFdmVudCBTb3VyY2UgZm9yIFByb2Nlc3NvciBMYW1iZGFcbiAgICBwcm9jZXNzb3JMYW1iZGEuYWRkRXZlbnRTb3VyY2UoXG4gICAgICBuZXcgbGFtYmRhRXZlbnRTb3VyY2VzLlNxc0V2ZW50U291cmNlKHByb2Nlc3NpbmdRdWV1ZSwge1xuICAgICAgICBiYXRjaFNpemU6IDEsIC8vIFByb2Nlc3Mgb25lIGVzc2F5IGF0IGEgdGltZVxuICAgICAgICBtYXhCYXRjaGluZ1dpbmRvdzogY2RrLkR1cmF0aW9uLnNlY29uZHMoMCksXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIEVwaWMgNzogQWdncmVnYXRpb24gTGFtYmRhXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIC8vIElBTSBSb2xlIGZvciBBZ2dyZWdhdGlvbiBMYW1iZGFcbiAgICBjb25zdCBhZ2dyZWdhdGlvbkxhbWJkYVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0FnZ3JlZ2F0aW9uTGFtYmRhUm9sZScsIHtcbiAgICAgIHJvbGVOYW1lOiAndmluY2VudC12b2NhYi1hZ2dyZWdhdGlvbi1sYW1iZGEtcm9sZScsXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnSUFNIHJvbGUgZm9yIGFnZ3JlZ2F0aW9uIExhbWJkYSBmdW5jdGlvbicsXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJyksXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgcGVybWlzc2lvbnMgZm9yIEFnZ3JlZ2F0aW9uIExhbWJkYVxuICAgIG1ldHJpY3NUYWJsZS5ncmFudFJlYWREYXRhKGFnZ3JlZ2F0aW9uTGFtYmRhUm9sZSk7XG4gICAgY2xhc3NNZXRyaWNzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGFnZ3JlZ2F0aW9uTGFtYmRhUm9sZSk7XG4gICAgZXNzYXlVcGRhdGVRdWV1ZS5ncmFudENvbnN1bWVNZXNzYWdlcyhhZ2dyZWdhdGlvbkxhbWJkYVJvbGUpO1xuXG4gICAgLy8gQWdncmVnYXRpb24gTGFtYmRhIEZ1bmN0aW9uIChmb3IgQ2xhc3NNZXRyaWNzKVxuICAgIGNvbnN0IGFnZ3JlZ2F0aW9uTGFtYmRhQ29kZSA9IHByb2Nlc3MuZW52LkNES19TS0lQX0JVTkRMSU5HID09PSAndHJ1ZSdcbiAgICAgID8gbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGEvYWdncmVnYXRpb25zJykpXG4gICAgICA6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhL2FnZ3JlZ2F0aW9ucycpLCB7XG4gICAgICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgICAgIGltYWdlOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMi5idW5kbGluZ0ltYWdlLFxuICAgICAgICAgICAgY29tbWFuZDogW1xuICAgICAgICAgICAgICAnYmFzaCcsICctYycsXG4gICAgICAgICAgICAgICdwaXAgaW5zdGFsbCAtciByZXF1aXJlbWVudHMudHh0IC10IC9hc3NldC1vdXRwdXQgJiYgY3AgLWF1IC4gL2Fzc2V0LW91dHB1dCcsXG4gICAgICAgICAgICBdLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgY29uc3QgYWdncmVnYXRpb25MYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdBZ2dyZWdhdGlvbkxhbWJkYScsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ3ZpbmNlbnQtdm9jYWItYWdncmVnYXRpb24tbGFtYmRhJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzEyLFxuICAgICAgaGFuZGxlcjogJ2NsYXNzX21ldHJpY3MuaGFuZGxlcicsXG4gICAgICBjb2RlOiBhZ2dyZWdhdGlvbkxhbWJkYUNvZGUsXG4gICAgICByb2xlOiBhZ2dyZWdhdGlvbkxhbWJkYVJvbGUsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygyKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIE1FVFJJQ1NfVEFCTEU6IG1ldHJpY3NUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIENMQVNTX01FVFJJQ1NfVEFCTEU6IGNsYXNzTWV0cmljc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBTUVMgRXZlbnQgU291cmNlIGZvciBBZ2dyZWdhdGlvbiBMYW1iZGFcbiAgICBhZ2dyZWdhdGlvbkxhbWJkYS5hZGRFdmVudFNvdXJjZShcbiAgICAgIG5ldyBsYW1iZGFFdmVudFNvdXJjZXMuU3FzRXZlbnRTb3VyY2UoZXNzYXlVcGRhdGVRdWV1ZSwge1xuICAgICAgICBiYXRjaFNpemU6IDEwLCAvLyBQcm9jZXNzIHVwIHRvIDEwIHVwZGF0ZXMgYXQgYSB0aW1lXG4gICAgICAgIG1heEJhdGNoaW5nV2luZG93OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBHcmFudCBQcm9jZXNzb3IgTGFtYmRhIHBlcm1pc3Npb24gdG8gc2VuZCBtZXNzYWdlcyB0byBFc3NheVVwZGF0ZVF1ZXVlXG4gICAgcHJvY2Vzc29yTGFtYmRhUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbJ3NxczpTZW5kTWVzc2FnZSddLFxuICAgICAgICByZXNvdXJjZXM6IFtlc3NheVVwZGF0ZVF1ZXVlLnF1ZXVlQXJuXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gQ2xvdWRXYXRjaCBPYnNlcnZhYmlsaXR5IChFcGljIDUpXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIC8vIFNOUyBUb3BpYyBmb3IgYWxhcm0gbm90aWZpY2F0aW9ucyAob3B0aW9uYWwgLSBjYW4gYmUgY29uZmlndXJlZCBsYXRlcilcbiAgICBjb25zdCBhbGFybVRvcGljID0gbmV3IHNucy5Ub3BpYyh0aGlzLCAnQWxhcm1Ub3BpYycsIHtcbiAgICAgIGRpc3BsYXlOYW1lOiAndmluY2VudC12b2NhYi1lc3NheS1hbmFseXplci1hbGFybXMnLFxuICAgIH0pO1xuXG4gICAgLy8gQ2xvdWRXYXRjaCBBbGFybTogQVBJIExhbWJkYSBFcnJvcnNcbiAgICBjb25zdCBhcGlMYW1iZGFFcnJvckFsYXJtID0gbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgJ0FwaUxhbWJkYUVycm9yQWxhcm0nLCB7XG4gICAgICBhbGFybU5hbWU6ICd2aW5jZW50LXZvY2FiLWFwaS1sYW1iZGEtZXJyb3JzJyxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246ICdBbGVydHMgd2hlbiBBUEkgTGFtYmRhIGVycm9ycyBleGNlZWQgdGhyZXNob2xkJyxcbiAgICAgIG1ldHJpYzogYXBpTGFtYmRhLm1ldHJpY0Vycm9ycyh7XG4gICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogNSwgLy8gQWxlcnQgaWYgNSsgZXJyb3JzIGluIDUgbWludXRlc1xuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcbiAgICBhcGlMYW1iZGFFcnJvckFsYXJtLmFkZEFsYXJtQWN0aW9uKG5ldyBjbG91ZHdhdGNoQWN0aW9ucy5TbnNBY3Rpb24oYWxhcm1Ub3BpYykpO1xuXG4gICAgLy8gQ2xvdWRXYXRjaCBBbGFybTogUzMgVXBsb2FkIExhbWJkYSBFcnJvcnNcbiAgICBjb25zdCBzM1VwbG9hZExhbWJkYUVycm9yQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnUzNVcGxvYWRMYW1iZGFFcnJvckFsYXJtJywge1xuICAgICAgYWxhcm1OYW1lOiAndmluY2VudC12b2NhYi1zMy11cGxvYWQtbGFtYmRhLWVycm9ycycsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnQWxlcnRzIHdoZW4gUzMgVXBsb2FkIExhbWJkYSBlcnJvcnMgZXhjZWVkIHRocmVzaG9sZCcsXG4gICAgICBtZXRyaWM6IHMzVXBsb2FkTGFtYmRhLm1ldHJpY0Vycm9ycyh7XG4gICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogNSwgLy8gQWxlcnQgaWYgNSsgZXJyb3JzIGluIDUgbWludXRlc1xuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcbiAgICBzM1VwbG9hZExhbWJkYUVycm9yQWxhcm0uYWRkQWxhcm1BY3Rpb24obmV3IGNsb3Vkd2F0Y2hBY3Rpb25zLlNuc0FjdGlvbihhbGFybVRvcGljKSk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIEFsYXJtOiBQcm9jZXNzb3IgTGFtYmRhIEVycm9yc1xuICAgIGNvbnN0IHByb2Nlc3NvckxhbWJkYUVycm9yQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnUHJvY2Vzc29yTGFtYmRhRXJyb3JBbGFybScsIHtcbiAgICAgIGFsYXJtTmFtZTogJ3ZpbmNlbnQtdm9jYWItcHJvY2Vzc29yLWxhbWJkYS1lcnJvcnMnLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ0FsZXJ0cyB3aGVuIFByb2Nlc3NvciBMYW1iZGEgZXJyb3JzIGV4Y2VlZCB0aHJlc2hvbGQnLFxuICAgICAgbWV0cmljOiBwcm9jZXNzb3JMYW1iZGEubWV0cmljRXJyb3JzKHtcbiAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiAzLCAvLyBBbGVydCBpZiAzKyBlcnJvcnMgaW4gNSBtaW51dGVzIChtb3JlIGNyaXRpY2FsKVxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcbiAgICBwcm9jZXNzb3JMYW1iZGFFcnJvckFsYXJtLmFkZEFsYXJtQWN0aW9uKG5ldyBjbG91ZHdhdGNoQWN0aW9ucy5TbnNBY3Rpb24oYWxhcm1Ub3BpYykpO1xuXG4gICAgLy8gQ2xvdWRXYXRjaCBBbGFybTogRGVhZCBMZXR0ZXIgUXVldWUgTWVzc2FnZXMgKEZhaWxlZCBQcm9jZXNzaW5nKVxuICAgIGNvbnN0IGRscUFsYXJtID0gbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgJ0RMUUFsYXJtJywge1xuICAgICAgYWxhcm1OYW1lOiAndmluY2VudC12b2NhYi1kbHEtbWVzc2FnZXMnLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ0FsZXJ0cyB3aGVuIG1lc3NhZ2VzIGFyZSBzZW50IHRvIERMUSAocHJvY2Vzc2luZyBmYWlsdXJlcyknLFxuICAgICAgbWV0cmljOiBkbHEubWV0cmljQXBwcm94aW1hdGVOdW1iZXJPZk1lc3NhZ2VzVmlzaWJsZSh7XG4gICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogMSwgLy8gQWxlcnQgaWYgYW55IG1lc3NhZ2UgaW4gRExRXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuICAgIGRscUFsYXJtLmFkZEFsYXJtQWN0aW9uKG5ldyBjbG91ZHdhdGNoQWN0aW9ucy5TbnNBY3Rpb24oYWxhcm1Ub3BpYykpO1xuXG4gICAgLy8gQ2xvdWRXYXRjaCBBbGFybTogUHJvY2Vzc29yIExhbWJkYSBUaHJvdHRsZXMgKE9wdGlvbmFsKVxuICAgIGNvbnN0IHByb2Nlc3NvckxhbWJkYVRocm90dGxlQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnUHJvY2Vzc29yTGFtYmRhVGhyb3R0bGVBbGFybScsIHtcbiAgICAgIGFsYXJtTmFtZTogJ3ZpbmNlbnQtdm9jYWItcHJvY2Vzc29yLWxhbWJkYS10aHJvdHRsZXMnLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ0FsZXJ0cyB3aGVuIFByb2Nlc3NvciBMYW1iZGEgaXMgdGhyb3R0bGVkJyxcbiAgICAgIG1ldHJpYzogcHJvY2Vzc29yTGFtYmRhLm1ldHJpY1Rocm90dGxlcyh7XG4gICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogMSwgLy8gQWxlcnQgaWYgYW55IHRocm90dGxlc1xuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcbiAgICBwcm9jZXNzb3JMYW1iZGFUaHJvdHRsZUFsYXJtLmFkZEFsYXJtQWN0aW9uKG5ldyBjbG91ZHdhdGNoQWN0aW9ucy5TbnNBY3Rpb24oYWxhcm1Ub3BpYykpO1xuXG4gICAgLy8gQ2xvdWRXYXRjaCBBbGFybTogUHJvY2Vzc29yIExhbWJkYSBEdXJhdGlvbiAoSGlnaCBEdXJhdGlvbiBXYXJuaW5nKVxuICAgIGNvbnN0IHByb2Nlc3NvckxhbWJkYUR1cmF0aW9uQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnUHJvY2Vzc29yTGFtYmRhRHVyYXRpb25BbGFybScsIHtcbiAgICAgIGFsYXJtTmFtZTogJ3ZpbmNlbnQtdm9jYWItcHJvY2Vzc29yLWxhbWJkYS1kdXJhdGlvbicsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnQWxlcnRzIHdoZW4gUHJvY2Vzc29yIExhbWJkYSBkdXJhdGlvbiBpcyBoaWdoIChhcHByb2FjaGluZyB0aW1lb3V0KScsXG4gICAgICBtZXRyaWM6IHByb2Nlc3NvckxhbWJkYS5tZXRyaWNEdXJhdGlvbih7XG4gICAgICAgIHN0YXRpc3RpYzogJ0F2ZXJhZ2UnLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDI0MDAwMCwgLy8gNCBtaW51dGVzICg4MCUgb2YgNS1taW51dGUgdGltZW91dClcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAyLCAvLyBNdXN0IGV4Y2VlZCB0aHJlc2hvbGQgZm9yIDIgcGVyaW9kc1xuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG4gICAgcHJvY2Vzc29yTGFtYmRhRHVyYXRpb25BbGFybS5hZGRBbGFybUFjdGlvbihuZXcgY2xvdWR3YXRjaEFjdGlvbnMuU25zQWN0aW9uKGFsYXJtVG9waWMpKTtcblxuICAgIC8vIENsb3VkRm9ybWF0aW9uIE91dHB1dHNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRXNzYXlzQnVja2V0TmFtZScsIHtcbiAgICAgIHZhbHVlOiBlc3NheXNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUzMgYnVja2V0IG5hbWUgZm9yIGVzc2F5IHN0b3JhZ2UnLFxuICAgICAgZXhwb3J0TmFtZTogJ0Vzc2F5c0J1Y2tldE5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1Byb2Nlc3NpbmdRdWV1ZVVybCcsIHtcbiAgICAgIHZhbHVlOiBwcm9jZXNzaW5nUXVldWUucXVldWVVcmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NRUyBxdWV1ZSBVUkwgZm9yIGVzc2F5IHByb2Nlc3NpbmcnLFxuICAgICAgZXhwb3J0TmFtZTogJ1Byb2Nlc3NpbmdRdWV1ZVVybCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTWV0cmljc1RhYmxlTmFtZScsIHtcbiAgICAgIHZhbHVlOiBtZXRyaWNzVGFibGUudGFibGVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdEeW5hbW9EQiB0YWJsZSBuYW1lIGZvciBlc3NheSBtZXRyaWNzJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdNZXRyaWNzVGFibGVOYW1lJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdUZWFjaGVyc1RhYmxlTmFtZScsIHtcbiAgICAgIHZhbHVlOiB0ZWFjaGVyc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRHluYW1vREIgdGFibGUgbmFtZSBmb3IgdGVhY2hlcnMnLFxuICAgICAgZXhwb3J0TmFtZTogJ1RlYWNoZXJzVGFibGVOYW1lJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTdHVkZW50c1RhYmxlTmFtZScsIHtcbiAgICAgIHZhbHVlOiBzdHVkZW50c1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRHluYW1vREIgdGFibGUgbmFtZSBmb3Igc3R1ZGVudHMnLFxuICAgICAgZXhwb3J0TmFtZTogJ1N0dWRlbnRzVGFibGVOYW1lJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBc3NpZ25tZW50c1RhYmxlTmFtZScsIHtcbiAgICAgIHZhbHVlOiBhc3NpZ25tZW50c1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRHluYW1vREIgdGFibGUgbmFtZSBmb3IgYXNzaWdubWVudHMnLFxuICAgICAgZXhwb3J0TmFtZTogJ0Fzc2lnbm1lbnRzVGFibGVOYW1lJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDbGFzc01ldHJpY3NUYWJsZU5hbWUnLCB7XG4gICAgICB2YWx1ZTogY2xhc3NNZXRyaWNzVGFibGUudGFibGVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdEeW5hbW9EQiB0YWJsZSBuYW1lIGZvciBjbGFzcyBtZXRyaWNzJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdDbGFzc01ldHJpY3NUYWJsZU5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaUxhbWJkYVJvbGVBcm4nLCB7XG4gICAgICB2YWx1ZTogYXBpTGFtYmRhUm9sZS5yb2xlQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdJQU0gcm9sZSBBUk4gZm9yIEFQSSBMYW1iZGEnLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwaUxhbWJkYVJvbGVBcm4nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1MzVXBsb2FkTGFtYmRhUm9sZUFybicsIHtcbiAgICAgIHZhbHVlOiBzM1VwbG9hZExhbWJkYVJvbGUucm9sZUFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnSUFNIHJvbGUgQVJOIGZvciBTMyB1cGxvYWQgdHJpZ2dlciBMYW1iZGEnLFxuICAgICAgZXhwb3J0TmFtZTogJ1MzVXBsb2FkTGFtYmRhUm9sZUFybicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUHJvY2Vzc29yTGFtYmRhUm9sZUFybicsIHtcbiAgICAgIHZhbHVlOiBwcm9jZXNzb3JMYW1iZGFSb2xlLnJvbGVBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0lBTSByb2xlIEFSTiBmb3IgcHJvY2Vzc29yIExhbWJkYScsXG4gICAgICBleHBvcnROYW1lOiAnUHJvY2Vzc29yTGFtYmRhUm9sZUFybicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBpVXJsJywge1xuICAgICAgdmFsdWU6IGFwaS51cmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBHYXRld2F5IGVuZHBvaW50IFVSTCcsXG4gICAgICBleHBvcnROYW1lOiAnQXBpVXJsJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQcm9jZXNzb3JMYW1iZGFBcm4nLCB7XG4gICAgICB2YWx1ZTogcHJvY2Vzc29yTGFtYmRhLmZ1bmN0aW9uQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdQcm9jZXNzb3IgTGFtYmRhIGZ1bmN0aW9uIEFSTicsXG4gICAgICBleHBvcnROYW1lOiAnUHJvY2Vzc29yTGFtYmRhQXJuJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBbGFybVRvcGljQXJuJywge1xuICAgICAgdmFsdWU6IGFsYXJtVG9waWMudG9waWNBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ1NOUyB0b3BpYyBBUk4gZm9yIENsb3VkV2F0Y2ggYWxhcm0gbm90aWZpY2F0aW9ucycsXG4gICAgICBleHBvcnROYW1lOiAnQWxhcm1Ub3BpY0FybicsXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIENvZ25pdG8gT3V0cHV0cyAoRXBpYyA2KVxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ29nbml0b1VzZXJQb29sSWQnLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgSUQgZm9yIHRlYWNoZXIgYXV0aGVudGljYXRpb24nLFxuICAgICAgZXhwb3J0TmFtZTogJ0NvZ25pdG9Vc2VyUG9vbElkJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDb2duaXRvVXNlclBvb2xDbGllbnRJZCcsIHtcbiAgICAgIHZhbHVlOiB1c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBDbGllbnQgSUQgZm9yIGZyb250ZW5kJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdDb2duaXRvVXNlclBvb2xDbGllbnRJZCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ29nbml0b1JlZ2lvbicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnJlZ2lvbixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVdTIHJlZ2lvbiBmb3IgQ29nbml0bycsXG4gICAgICBleHBvcnROYW1lOiAnQ29nbml0b1JlZ2lvbicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ29nbml0b0hvc3RlZFVpVXJsJywge1xuICAgICAgdmFsdWU6IGBodHRwczovLyR7dXNlclBvb2xEb21haW4uZG9tYWluTmFtZX0uYXV0aC4ke3RoaXMucmVnaW9ufS5hbWF6b25jb2duaXRvLmNvbWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gSG9zdGVkIFVJIFVSTCcsXG4gICAgICBleHBvcnROYW1lOiAnQ29nbml0b0hvc3RlZFVpVXJsJyxcbiAgICB9KTtcbiAgfVxufVxuIl19
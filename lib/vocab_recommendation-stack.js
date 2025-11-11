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
                STUDENT_METRICS_TABLE: studentMetricsTable.tableName,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidm9jYWJfcmVjb21tZW5kYXRpb24tc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2b2NhYl9yZWNvbW1lbmRhdGlvbi1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUVuQyx1REFBeUM7QUFDekMsbUVBQXFEO0FBQ3JELHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MsK0RBQWlEO0FBQ2pELHVFQUF5RDtBQUN6RCxzRUFBd0Q7QUFDeEQseUZBQTJFO0FBQzNFLHVFQUF5RDtBQUN6RCxzRkFBd0U7QUFDeEUseURBQTJDO0FBQzNDLGlFQUFtRDtBQUNuRCwyQ0FBNkI7QUFFN0IsTUFBYSx3QkFBeUIsU0FBUSxHQUFHLENBQUMsS0FBSztJQUNyRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLDhCQUE4QjtRQUM5QixNQUFNLFlBQVksR0FBRyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtZQUN2RCxVQUFVLEVBQUUsd0JBQXdCLElBQUksQ0FBQyxPQUFPLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRTtZQUNqRSxhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsbUNBQW1DO1lBQzdFLGlCQUFpQixFQUFFLElBQUksRUFBRSxxREFBcUQ7WUFDOUUsU0FBUyxFQUFFLEtBQUs7WUFDaEIsVUFBVSxFQUFFLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVO1lBQzFDLGlCQUFpQixFQUFFLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTO1lBQ2pELElBQUksRUFBRTtnQkFDSjtvQkFDRSxjQUFjLEVBQUUsQ0FBQyxHQUFHLENBQUM7b0JBQ3JCLGNBQWMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxXQUFXLENB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QUFVO1lBQzFCLFdBQVcsRUFBRSxpREFBaUQ7WUFDOUQsVUFBVSxFQUFFLG1CQUFtQjtTQUNoQyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHlCQUF5QixFQUFFO1lBQ2pELEtBQUssRUFBRSxjQUFjLENBQUMsZ0JBQWdCO1lBQ3RDLFdBQVcsRUFBRSwwQ0FBMEM7WUFDdkQsVUFBVSxFQUFFLHlCQUF5QjtTQUN0QyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUN2QyxLQUFLLEVBQUUsSUFBSSxDQUFDLE1BQU07WUFDbEIsV0FBVyxFQUFFLHdCQUF3QjtZQUNyQyxVQUFVLEVBQUUsZUFBZTtTQUM1QixDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQzVDLEtBQUssRUFBRSxXQUFXLGNBQWMsQ0FBQyxVQUFVLFNBQVMsSUFBSSxDQUFDLE1BQU0sb0JBQW9CO1lBQ25GLFdBQVcsRUFBRSx1QkFBdUI7WUFDcEMsVUFBVSxFQUFFLG9CQUFvQjtTQUNqQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFwcUJELDREQW9xQkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcbmltcG9ydCAqIGFzIHNxcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3FzJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgczNuIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMy1ub3RpZmljYXRpb25zJztcbmltcG9ydCAqIGFzIGxhbWJkYUV2ZW50U291cmNlcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhLWV2ZW50LXNvdXJjZXMnO1xuaW1wb3J0ICogYXMgY2xvdWR3YXRjaCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaCc7XG5pbXBvcnQgKiBhcyBjbG91ZHdhdGNoQWN0aW9ucyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaC1hY3Rpb25zJztcbmltcG9ydCAqIGFzIHNucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zJztcbmltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZ25pdG8nO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuZXhwb3J0IGNsYXNzIFZvY2FiUmVjb21tZW5kYXRpb25TdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIC8vIFMzIEJ1Y2tldCBmb3IgZXNzYXkgdXBsb2Fkc1xuICAgIGNvbnN0IGVzc2F5c0J1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0Vzc2F5c0J1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGB2aW5jZW50LXZvY2FiLWVzc2F5cy0ke3RoaXMuYWNjb3VudH0tJHt0aGlzLnJlZ2lvbn1gLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSwgLy8gRm9yIFBvQyAtIGFsbG93cyBidWNrZXQgZGVsZXRpb25cbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLCAvLyBBdXRvbWF0aWNhbGx5IGRlbGV0ZSBvYmplY3RzIHdoZW4gc3RhY2sgaXMgZGVsZXRlZFxuICAgICAgdmVyc2lvbmVkOiBmYWxzZSxcbiAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICBjb3JzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhbGxvd2VkT3JpZ2luczogWycqJ10sXG4gICAgICAgICAgYWxsb3dlZE1ldGhvZHM6IFtzMy5IdHRwTWV0aG9kcy5HRVQsIHMzLkh0dHBNZXRob2RzLlBVVCwgczMuSHR0cE1ldGhvZHMuUE9TVF0sXG4gICAgICAgICAgYWxsb3dlZEhlYWRlcnM6IFsnKiddLFxuICAgICAgICAgIG1heEFnZTogMzYwMCxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBTUVMgRGVhZCBMZXR0ZXIgUXVldWVcbiAgICBjb25zdCBkbHEgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsICdQcm9jZXNzaW5nRExRJywge1xuICAgICAgcXVldWVOYW1lOiAndmluY2VudC12b2NhYi1lc3NheS1wcm9jZXNzaW5nLWRscScsXG4gICAgICByZXRlbnRpb25QZXJpb2Q6IGNkay5EdXJhdGlvbi5kYXlzKDE0KSxcbiAgICAgIGVuY3J5cHRpb246IHNxcy5RdWV1ZUVuY3J5cHRpb24uU1FTX01BTkFHRUQsXG4gICAgfSk7XG5cbiAgICAvLyBTUVMgUXVldWUgZm9yIGVzc2F5IHByb2Nlc3NpbmdcbiAgICBjb25zdCBwcm9jZXNzaW5nUXVldWUgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsICdFc3NheVByb2Nlc3NpbmdRdWV1ZScsIHtcbiAgICAgIHF1ZXVlTmFtZTogJ3ZpbmNlbnQtdm9jYWItZXNzYXktcHJvY2Vzc2luZy1xdWV1ZScsXG4gICAgICB2aXNpYmlsaXR5VGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksIC8vIE11c3QgYmUgPj0gTGFtYmRhIHRpbWVvdXRcbiAgICAgIHJldGVudGlvblBlcmlvZDogY2RrLkR1cmF0aW9uLmRheXMoMTQpLFxuICAgICAgZW5jcnlwdGlvbjogc3FzLlF1ZXVlRW5jcnlwdGlvbi5TUVNfTUFOQUdFRCxcbiAgICAgIGRlYWRMZXR0ZXJRdWV1ZToge1xuICAgICAgICBxdWV1ZTogZGxxLFxuICAgICAgICBtYXhSZWNlaXZlQ291bnQ6IDMsIC8vIFJldHJ5IDMgdGltZXMgYmVmb3JlIHNlbmRpbmcgdG8gRExRXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gU1FTIFF1ZXVlIGZvciBlc3NheSB1cGRhdGVzICh0cmlnZ2VycyBtZXRyaWMgcmVjYWxjdWxhdGlvbikgLSBFcGljIDdcbiAgICBjb25zdCBlc3NheVVwZGF0ZVF1ZXVlID0gbmV3IHNxcy5RdWV1ZSh0aGlzLCAnRXNzYXlVcGRhdGVRdWV1ZScsIHtcbiAgICAgIHF1ZXVlTmFtZTogJ3ZpbmNlbnQtdm9jYWItZXNzYXktdXBkYXRlLXF1ZXVlJyxcbiAgICAgIHZpc2liaWxpdHlUaW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygyKSxcbiAgICAgIHJldGVudGlvblBlcmlvZDogY2RrLkR1cmF0aW9uLmRheXMoMTQpLFxuICAgICAgZW5jcnlwdGlvbjogc3FzLlF1ZXVlRW5jcnlwdGlvbi5TUVNfTUFOQUdFRCxcbiAgICB9KTtcblxuICAgIC8vIER5bmFtb0RCIFRhYmxlIGZvciBlc3NheSBtZXRyaWNzXG4gICAgY29uc3QgbWV0cmljc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdFc3NheU1ldHJpY3MnLCB7XG4gICAgICB0YWJsZU5hbWU6ICdWaW5jZW50Vm9jYWJFc3NheU1ldHJpY3MnLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdlc3NheV9pZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULCAvLyBPbi1kZW1hbmQgcHJpY2luZyBmb3IgUG9DXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLCAvLyBGb3IgUG9DIC0gYWxsb3dzIHRhYmxlIGRlbGV0aW9uXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjoge1xuICAgICAgICBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogZmFsc2UsIC8vIENhbiBlbmFibGUgZm9yIHByb2R1Y3Rpb25cbiAgICAgIH0sXG4gICAgICBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQVdTX01BTkFHRUQsXG4gICAgfSk7XG5cbiAgICAvLyBEeW5hbW9EQiBUYWJsZSBmb3IgdGVhY2hlcnMgKEVwaWMgNilcbiAgICBjb25zdCB0ZWFjaGVyc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdUZWFjaGVycycsIHtcbiAgICAgIHRhYmxlTmFtZTogJ1ZpbmNlbnRWb2NhYlRlYWNoZXJzJyxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAndGVhY2hlcl9pZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGVuY3J5cHRpb246IGR5bmFtb2RiLlRhYmxlRW5jcnlwdGlvbi5BV1NfTUFOQUdFRCxcbiAgICB9KTtcblxuICAgIC8vIER5bmFtb0RCIFRhYmxlIGZvciBzdHVkZW50cyAoRXBpYyA3KVxuICAgIGNvbnN0IHN0dWRlbnRzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ1N0dWRlbnRzJywge1xuICAgICAgdGFibGVOYW1lOiAnVmluY2VudFZvY2FiU3R1ZGVudHMnLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICd0ZWFjaGVyX2lkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogJ3N0dWRlbnRfaWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQVdTX01BTkFHRUQsXG4gICAgfSk7XG5cbiAgICAvLyBEeW5hbW9EQiBUYWJsZSBmb3IgYXNzaWdubWVudHMgKEVwaWMgNylcbiAgICBjb25zdCBhc3NpZ25tZW50c1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdBc3NpZ25tZW50cycsIHtcbiAgICAgIHRhYmxlTmFtZTogJ1ZpbmNlbnRWb2NhYkFzc2lnbm1lbnRzJyxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAndGVhY2hlcl9pZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICdhc3NpZ25tZW50X2lkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgZW5jcnlwdGlvbjogZHluYW1vZGIuVGFibGVFbmNyeXB0aW9uLkFXU19NQU5BR0VELFxuICAgIH0pO1xuXG4gICAgLy8gRHluYW1vREIgVGFibGUgZm9yIGNsYXNzIG1ldHJpY3MgKEVwaWMgNylcbiAgICBjb25zdCBjbGFzc01ldHJpY3NUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnQ2xhc3NNZXRyaWNzJywge1xuICAgICAgdGFibGVOYW1lOiAnVmluY2VudFZvY2FiQ2xhc3NNZXRyaWNzJyxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAndGVhY2hlcl9pZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICdhc3NpZ25tZW50X2lkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgZW5jcnlwdGlvbjogZHluYW1vZGIuVGFibGVFbmNyeXB0aW9uLkFXU19NQU5BR0VELFxuICAgIH0pO1xuXG4gICAgLy8gU3R1ZGVudE1ldHJpY3MgdGFibGUgZm9yIHN0dWRlbnQtbGV2ZWwgcm9sbGluZyBhdmVyYWdlc1xuICAgIGNvbnN0IHN0dWRlbnRNZXRyaWNzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ1N0dWRlbnRNZXRyaWNzJywge1xuICAgICAgdGFibGVOYW1lOiAnVmluY2VudFZvY2FiU3R1ZGVudE1ldHJpY3MnLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICd0ZWFjaGVyX2lkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogJ3N0dWRlbnRfaWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQVdTX01BTkFHRUQsXG4gICAgfSk7XG5cbiAgICAvLyBJQU0gUm9sZSBmb3IgQVBJIExhbWJkYSAod2lsbCBiZSB1c2VkIGluIEVwaWMgMilcbiAgICBjb25zdCBhcGlMYW1iZGFSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdBcGlMYW1iZGFSb2xlJywge1xuICAgICAgcm9sZU5hbWU6ICd2aW5jZW50LXZvY2FiLWFwaS1sYW1iZGEtcm9sZScsXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnSUFNIHJvbGUgZm9yIEFQSSBMYW1iZGEgZnVuY3Rpb24nLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZScpLFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IHBlcm1pc3Npb25zIGZvciBBUEkgTGFtYmRhXG4gICAgZXNzYXlzQnVja2V0LmdyYW50UmVhZFdyaXRlKGFwaUxhbWJkYVJvbGUpO1xuICAgIG1ldHJpY3NUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoYXBpTGFtYmRhUm9sZSk7XG4gICAgdGVhY2hlcnNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoYXBpTGFtYmRhUm9sZSk7XG4gICAgc3R1ZGVudHNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoYXBpTGFtYmRhUm9sZSk7XG4gICAgYXNzaWdubWVudHNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoYXBpTGFtYmRhUm9sZSk7XG4gICAgY2xhc3NNZXRyaWNzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGFwaUxhbWJkYVJvbGUpO1xuICAgIHN0dWRlbnRNZXRyaWNzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGFwaUxhbWJkYVJvbGUpO1xuICAgIHByb2Nlc3NpbmdRdWV1ZS5ncmFudFNlbmRNZXNzYWdlcyhhcGlMYW1iZGFSb2xlKTtcbiAgICBlc3NheVVwZGF0ZVF1ZXVlLmdyYW50U2VuZE1lc3NhZ2VzKGFwaUxhbWJkYVJvbGUpO1xuXG4gICAgLy8gSUFNIFJvbGUgZm9yIFMzIFVwbG9hZCBMYW1iZGEgKHdpbGwgYmUgdXNlZCBpbiBFcGljIDIpXG4gICAgLy8gVGhpcyBMYW1iZGEgd2lsbCBiZSB0cmlnZ2VyZWQgYnkgUzMgZXZlbnRzIGFuZCBwdXNoIHRvIFNRU1xuICAgIGNvbnN0IHMzVXBsb2FkTGFtYmRhUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnUzNVcGxvYWRMYW1iZGFSb2xlJywge1xuICAgICAgcm9sZU5hbWU6ICd2aW5jZW50LXZvY2FiLXMzLXVwbG9hZC1sYW1iZGEtcm9sZScsXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnSUFNIHJvbGUgZm9yIFMzIHVwbG9hZCB0cmlnZ2VyIExhbWJkYSBmdW5jdGlvbicsXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJyksXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgcGVybWlzc2lvbnMgZm9yIFMzIFVwbG9hZCBMYW1iZGFcbiAgICBlc3NheXNCdWNrZXQuZ3JhbnRSZWFkKHMzVXBsb2FkTGFtYmRhUm9sZSk7XG4gICAgcHJvY2Vzc2luZ1F1ZXVlLmdyYW50U2VuZE1lc3NhZ2VzKHMzVXBsb2FkTGFtYmRhUm9sZSk7XG5cbiAgICAvLyBJQU0gUm9sZSBmb3IgUHJvY2Vzc29yIExhbWJkYSAod2lsbCBiZSB1c2VkIGluIEVwaWMgMylcbiAgICBjb25zdCBwcm9jZXNzb3JMYW1iZGFSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdQcm9jZXNzb3JMYW1iZGFSb2xlJywge1xuICAgICAgcm9sZU5hbWU6ICd2aW5jZW50LXZvY2FiLXByb2Nlc3Nvci1sYW1iZGEtcm9sZScsXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnSUFNIHJvbGUgZm9yIGVzc2F5IHByb2Nlc3NvciBMYW1iZGEgZnVuY3Rpb24nLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZScpLFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IHBlcm1pc3Npb25zIGZvciBQcm9jZXNzb3IgTGFtYmRhXG4gICAgZXNzYXlzQnVja2V0LmdyYW50UmVhZChwcm9jZXNzb3JMYW1iZGFSb2xlKTtcbiAgICBtZXRyaWNzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHByb2Nlc3NvckxhbWJkYVJvbGUpO1xuICAgIHN0dWRlbnRzVGFibGUuZ3JhbnRSZWFkRGF0YShwcm9jZXNzb3JMYW1iZGFSb2xlKTtcbiAgICBhc3NpZ25tZW50c1RhYmxlLmdyYW50UmVhZERhdGEocHJvY2Vzc29yTGFtYmRhUm9sZSk7XG4gICAgY2xhc3NNZXRyaWNzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHByb2Nlc3NvckxhbWJkYVJvbGUpO1xuICAgIHByb2Nlc3NpbmdRdWV1ZS5ncmFudENvbnN1bWVNZXNzYWdlcyhwcm9jZXNzb3JMYW1iZGFSb2xlKTtcblxuICAgIC8vIEdyYW50IEJlZHJvY2sgcGVybWlzc2lvbnMgZm9yIFByb2Nlc3NvciBMYW1iZGFcbiAgICBwcm9jZXNzb3JMYW1iZGFSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFsnYmVkcm9jazpJbnZva2VNb2RlbCddLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBgYXJuOmF3czpiZWRyb2NrOiR7dGhpcy5yZWdpb259Ojpmb3VuZGF0aW9uLW1vZGVsL2FudGhyb3BpYy5jbGF1ZGUtMy1zb25uZXQtKmAsXG4gICAgICAgICAgYGFybjphd3M6YmVkcm9jazoke3RoaXMucmVnaW9ufTo6Zm91bmRhdGlvbi1tb2RlbC9hbnRocm9waWMuY2xhdWRlLTMtaGFpa3UtKmAsXG4gICAgICAgICAgYGFybjphd3M6YmVkcm9jazoke3RoaXMucmVnaW9ufTo6Zm91bmRhdGlvbi1tb2RlbC9hbnRocm9waWMuY2xhdWRlLTMtb3B1cy0qYCxcbiAgICAgICAgXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gQ29nbml0byBVc2VyIFBvb2wgKEVwaWMgNikgLSBNdXN0IGJlIGJlZm9yZSBBUEkgTGFtYmRhXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIC8vIENvZ25pdG8gVXNlciBQb29sIGZvciB0ZWFjaGVyIGF1dGhlbnRpY2F0aW9uXG4gICAgY29uc3QgdXNlclBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCAnVm9jYWJUZWFjaGVyc1Bvb2wnLCB7XG4gICAgICB1c2VyUG9vbE5hbWU6ICd2aW5jZW50LXZvY2FiLXRlYWNoZXJzLXBvb2wnLFxuICAgICAgc2lnbkluQWxpYXNlczoge1xuICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgICAgdXNlcm5hbWU6IGZhbHNlLFxuICAgICAgfSxcbiAgICAgIGF1dG9WZXJpZnk6IHtcbiAgICAgICAgZW1haWw6IHRydWUsXG4gICAgICB9LFxuICAgICAgcGFzc3dvcmRQb2xpY3k6IHtcbiAgICAgICAgbWluTGVuZ3RoOiA4LFxuICAgICAgICByZXF1aXJlTG93ZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlVXBwZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlRGlnaXRzOiB0cnVlLFxuICAgICAgICByZXF1aXJlU3ltYm9sczogZmFsc2UsXG4gICAgICB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSwgLy8gRm9yIFBvQ1xuICAgICAgbWZhOiBjb2duaXRvLk1mYS5PRkYsIC8vIE5vIE1GQSBmb3IgUG9DXG4gICAgfSk7XG5cbiAgICAvLyBDb2duaXRvIFVzZXIgUG9vbCBDbGllbnQgZm9yIGZyb250ZW5kXG4gICAgY29uc3QgdXNlclBvb2xDbGllbnQgPSBuZXcgY29nbml0by5Vc2VyUG9vbENsaWVudCh0aGlzLCAnVm9jYWJUZWFjaGVyc1Bvb2xDbGllbnQnLCB7XG4gICAgICB1c2VyUG9vbCxcbiAgICAgIHVzZXJQb29sQ2xpZW50TmFtZTogJ3ZpbmNlbnQtdm9jYWItdGVhY2hlcnMtY2xpZW50JyxcbiAgICAgIGdlbmVyYXRlU2VjcmV0OiBmYWxzZSwgLy8gUHVibGljIGNsaWVudCBmb3IgZnJvbnRlbmRcbiAgICAgIGF1dGhGbG93czoge1xuICAgICAgICB1c2VyUGFzc3dvcmQ6IHRydWUsIC8vIEFsbG93IHVzZXJuYW1lL3Bhc3N3b3JkIGF1dGhcbiAgICAgICAgdXNlclNycDogdHJ1ZSwgLy8gQWxsb3cgU1JQIGF1dGhcbiAgICAgIH0sXG4gICAgICBwcmV2ZW50VXNlckV4aXN0ZW5jZUVycm9yczogdHJ1ZSwgLy8gU2VjdXJpdHkgYmVzdCBwcmFjdGljZVxuICAgIH0pO1xuXG4gICAgLy8gQ29nbml0byBVc2VyIFBvb2wgRG9tYWluIChmb3IgSG9zdGVkIFVJKVxuICAgIGNvbnN0IHVzZXJQb29sRG9tYWluID0gdXNlclBvb2wuYWRkRG9tYWluKCdWb2NhYlRlYWNoZXJzUG9vbERvbWFpbicsIHtcbiAgICAgIGNvZ25pdG9Eb21haW46IHtcbiAgICAgICAgZG9tYWluUHJlZml4OiBgdmluY2VudC12b2NhYi0ke3RoaXMuYWNjb3VudH1gLCAvLyBNdXN0IGJlIGdsb2JhbGx5IHVuaXF1ZVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIEFQSSBMYW1iZGEgRnVuY3Rpb25cbiAgICAvLyBTa2lwIGJ1bmRsaW5nIGluIHRlc3QgZW52aXJvbm1lbnQgKERvY2tlciBub3QgYXZhaWxhYmxlKVxuICAgIGNvbnN0IGFwaUxhbWJkYUNvZGUgPSBwcm9jZXNzLmVudi5DREtfU0tJUF9CVU5ETElORyA9PT0gJ3RydWUnXG4gICAgICA/IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhL2FwaScpKVxuICAgICAgOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYS9hcGknKSwge1xuICAgICAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgICAgICBpbWFnZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTIuYnVuZGxpbmdJbWFnZSxcbiAgICAgICAgICAgIGNvbW1hbmQ6IFtcbiAgICAgICAgICAgICAgJ2Jhc2gnLCAnLWMnLFxuICAgICAgICAgICAgICAncGlwIGluc3RhbGwgLXIgcmVxdWlyZW1lbnRzLnR4dCAtdCAvYXNzZXQtb3V0cHV0ICYmIGNwIC1hdSAuIC9hc3NldC1vdXRwdXQnLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICBcbiAgICBjb25zdCBhcGlMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdBcGlMYW1iZGEnLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6ICd2aW5jZW50LXZvY2FiLWFwaS1sYW1iZGEnLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTIsXG4gICAgICBoYW5kbGVyOiAnbGFtYmRhX2Z1bmN0aW9uLmhhbmRsZXInLFxuICAgICAgY29kZTogYXBpTGFtYmRhQ29kZSxcbiAgICAgIHJvbGU6IGFwaUxhbWJkYVJvbGUsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBFU1NBWVNfQlVDS0VUOiBlc3NheXNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgTUVUUklDU19UQUJMRTogbWV0cmljc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgVEVBQ0hFUlNfVEFCTEU6IHRlYWNoZXJzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBTVFVERU5UU19UQUJMRTogc3R1ZGVudHNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIEFTU0lHTk1FTlRTX1RBQkxFOiBhc3NpZ25tZW50c1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgQ0xBU1NfTUVUUklDU19UQUJMRTogY2xhc3NNZXRyaWNzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBTVFVERU5UX01FVFJJQ1NfVEFCTEU6IHN0dWRlbnRNZXRyaWNzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBQUk9DRVNTSU5HX1FVRVVFX1VSTDogcHJvY2Vzc2luZ1F1ZXVlLnF1ZXVlVXJsLFxuICAgICAgICBFU1NBWV9VUERBVEVfUVVFVUVfVVJMOiBlc3NheVVwZGF0ZVF1ZXVlLnF1ZXVlVXJsLFxuICAgICAgICBDT0dOSVRPX1VTRVJfUE9PTF9JRDogdXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgICAgQ09HTklUT19VU0VSX1BPT0xfQ0xJRU5UX0lEOiB1c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgICBDT0dOSVRPX1JFR0lPTjogdGhpcy5yZWdpb24sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gUzMgVXBsb2FkIFRyaWdnZXIgTGFtYmRhIEZ1bmN0aW9uXG4gICAgLy8gU2tpcCBidW5kbGluZyBpbiB0ZXN0IGVudmlyb25tZW50IChEb2NrZXIgbm90IGF2YWlsYWJsZSlcbiAgICBjb25zdCBzM1VwbG9hZExhbWJkYUNvZGUgPSBwcm9jZXNzLmVudi5DREtfU0tJUF9CVU5ETElORyA9PT0gJ3RydWUnXG4gICAgICA/IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhL3MzX3VwbG9hZF90cmlnZ2VyJykpXG4gICAgICA6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhL3MzX3VwbG9hZF90cmlnZ2VyJyksIHtcbiAgICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgICAgaW1hZ2U6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzEyLmJ1bmRsaW5nSW1hZ2UsXG4gICAgICAgICAgICBjb21tYW5kOiBbXG4gICAgICAgICAgICAgICdiYXNoJywgJy1jJyxcbiAgICAgICAgICAgICAgJ3BpcCBpbnN0YWxsIC1yIHJlcXVpcmVtZW50cy50eHQgLXQgL2Fzc2V0LW91dHB1dCAmJiBjcCAtYXUgLiAvYXNzZXQtb3V0cHV0JyxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG4gICAgXG4gICAgY29uc3QgczNVcGxvYWRMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdTM1VwbG9hZExhbWJkYScsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ3ZpbmNlbnQtdm9jYWItczMtdXBsb2FkLWxhbWJkYScsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMixcbiAgICAgIGhhbmRsZXI6ICdsYW1iZGFfZnVuY3Rpb24uaGFuZGxlcicsXG4gICAgICBjb2RlOiBzM1VwbG9hZExhbWJkYUNvZGUsXG4gICAgICByb2xlOiBzM1VwbG9hZExhbWJkYVJvbGUsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSwgLy8gSW5jcmVhc2VkIGZvciB6aXAgZXh0cmFjdGlvbiBhbmQgbmFtZSBwYXJzaW5nXG4gICAgICBtZW1vcnlTaXplOiA1MTIsIC8vIEluY3JlYXNlZCBmb3Igc3BhQ3kgTkVSIHByb2Nlc3NpbmdcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFBST0NFU1NJTkdfUVVFVUVfVVJMOiBwcm9jZXNzaW5nUXVldWUucXVldWVVcmwsXG4gICAgICAgIFNUVURFTlRTX1RBQkxFOiBzdHVkZW50c1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgQVNTSUdOTUVOVFNfVEFCTEU6IGFzc2lnbm1lbnRzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBFU1NBWVNfQlVDS0VUOiBlc3NheXNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBhZGRpdGlvbmFsIHBlcm1pc3Npb25zIGZvciBTMyBVcGxvYWQgTGFtYmRhIChFcGljIDcpXG4gICAgc3R1ZGVudHNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoczNVcGxvYWRMYW1iZGFSb2xlKTtcbiAgICBhc3NpZ25tZW50c1RhYmxlLmdyYW50UmVhZERhdGEoczNVcGxvYWRMYW1iZGFSb2xlKTtcblxuICAgIC8vIFMzIEV2ZW50IE5vdGlmaWNhdGlvbiAtIHRyaWdnZXIgTGFtYmRhIG9uIG9iamVjdCBjcmVhdGlvblxuICAgIC8vIFByb2Nlc3MgYm90aCBlc3NheXMvIHByZWZpeCAoc2luZ2xlIGVzc2F5cykgYW5kIHRlYWNoZXJfaWQvYXNzaWdubWVudHMvIHByZWZpeCAoYmF0Y2ggdXBsb2FkcylcbiAgICBlc3NheXNCdWNrZXQuYWRkRXZlbnROb3RpZmljYXRpb24oXG4gICAgICBzMy5FdmVudFR5cGUuT0JKRUNUX0NSRUFURUQsXG4gICAgICBuZXcgczNuLkxhbWJkYURlc3RpbmF0aW9uKHMzVXBsb2FkTGFtYmRhKVxuICAgICk7XG5cbiAgICAvLyBBUEkgR2F0ZXdheVxuICAgIGNvbnN0IGFwaSA9IG5ldyBhcGlnYXRld2F5LlJlc3RBcGkodGhpcywgJ1ZvY2FiQXBpJywge1xuICAgICAgcmVzdEFwaU5hbWU6ICd2aW5jZW50LXZvY2FiLWVzc2F5LWFuYWx5emVyLWFwaScsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBmb3Igdm9jYWJ1bGFyeSBlc3NheSBhbmFseXNpcycsXG4gICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBhcGlnYXRld2F5LkNvcnMuQUxMX09SSUdJTlMsXG4gICAgICAgIGFsbG93TWV0aG9kczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9NRVRIT0RTLFxuICAgICAgICBhbGxvd0hlYWRlcnM6IFsnQ29udGVudC1UeXBlJywgJ1gtQW16LURhdGUnLCAnQXV0aG9yaXphdGlvbicsICdYLUFwaS1LZXknXSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDb2duaXRvIEF1dGhvcml6ZXIgZm9yIEFQSSBHYXRld2F5XG4gICAgY29uc3QgY29nbml0b0F1dGhvcml6ZXIgPSBuZXcgYXBpZ2F0ZXdheS5Db2duaXRvVXNlclBvb2xzQXV0aG9yaXplcih0aGlzLCAnQ29nbml0b0F1dGhvcml6ZXInLCB7XG4gICAgICBjb2duaXRvVXNlclBvb2xzOiBbdXNlclBvb2xdLFxuICAgICAgYXV0aG9yaXplck5hbWU6ICd2aW5jZW50LXZvY2FiLWNvZ25pdG8tYXV0aG9yaXplcicsXG4gICAgICBpZGVudGl0eVNvdXJjZTogJ21ldGhvZC5yZXF1ZXN0LmhlYWRlci5BdXRob3JpemF0aW9uJyxcbiAgICB9KTtcblxuICAgIC8vIEFQSSBHYXRld2F5IEludGVncmF0aW9uXG4gICAgY29uc3QgYXBpSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihhcGlMYW1iZGEpO1xuXG4gICAgLy8gSGVhbHRoIGNoZWNrIGVuZHBvaW50IChwdWJsaWMsIG5vIGF1dGggcmVxdWlyZWQpXG4gICAgY29uc3QgaGVhbHRoUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnaGVhbHRoJyk7XG4gICAgaGVhbHRoUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBhcGlJbnRlZ3JhdGlvbik7XG5cbiAgICAvLyBBdXRoIGVuZHBvaW50IChwdWJsaWMsIG5vIGF1dGggcmVxdWlyZWQgZm9yIC9hdXRoL2hlYWx0aClcbiAgICBjb25zdCBhdXRoUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnYXV0aCcpO1xuICAgIGNvbnN0IGF1dGhIZWFsdGhSZXNvdXJjZSA9IGF1dGhSZXNvdXJjZS5hZGRSZXNvdXJjZSgnaGVhbHRoJyk7XG4gICAgYXV0aEhlYWx0aFJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgYXBpSW50ZWdyYXRpb24pO1xuXG4gICAgLy8gUHJvdGVjdGVkIGVuZHBvaW50cyAocmVxdWlyZSBDb2duaXRvIGF1dGhlbnRpY2F0aW9uKVxuICAgIGNvbnN0IGF1dGhvcml6ZXJPcHRpb25zID0ge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH07XG5cbiAgICAvLyBQT1NUIC9lc3NheSBlbmRwb2ludCAocHJvdGVjdGVkKVxuICAgIGNvbnN0IGVzc2F5UmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnZXNzYXknKTtcbiAgICBlc3NheVJlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIGFwaUludGVncmF0aW9uLCBhdXRob3JpemVyT3B0aW9ucyk7XG5cbiAgICAvLyBHRVQgL2Vzc2F5L3tlc3NheV9pZH0gZW5kcG9pbnQgKHByb3RlY3RlZClcbiAgICBjb25zdCBlc3NheUlkUmVzb3VyY2UgPSBlc3NheVJlc291cmNlLmFkZFJlc291cmNlKCd7ZXNzYXlfaWR9Jyk7XG4gICAgZXNzYXlJZFJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgYXBpSW50ZWdyYXRpb24sIGF1dGhvcml6ZXJPcHRpb25zKTtcblxuICAgIC8vIFN0dWRlbnRzIGVuZHBvaW50cyAocHJvdGVjdGVkKSAtIEVwaWMgN1xuICAgIGNvbnN0IHN0dWRlbnRzUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnc3R1ZGVudHMnKTtcbiAgICBzdHVkZW50c1Jlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIGFwaUludGVncmF0aW9uLCBhdXRob3JpemVyT3B0aW9ucyk7IC8vIENyZWF0ZSBzdHVkZW50XG4gICAgc3R1ZGVudHNSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIGFwaUludGVncmF0aW9uLCBhdXRob3JpemVyT3B0aW9ucyk7IC8vIExpc3Qgc3R1ZGVudHNcbiAgICBjb25zdCBzdHVkZW50SWRSZXNvdXJjZSA9IHN0dWRlbnRzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3tzdHVkZW50X2lkfScpO1xuICAgIHN0dWRlbnRJZFJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgYXBpSW50ZWdyYXRpb24sIGF1dGhvcml6ZXJPcHRpb25zKTsgLy8gR2V0IHN0dWRlbnRcbiAgICBzdHVkZW50SWRSZXNvdXJjZS5hZGRNZXRob2QoJ1BBVENIJywgYXBpSW50ZWdyYXRpb24sIGF1dGhvcml6ZXJPcHRpb25zKTsgLy8gVXBkYXRlIHN0dWRlbnRcbiAgICBzdHVkZW50SWRSZXNvdXJjZS5hZGRNZXRob2QoJ0RFTEVURScsIGFwaUludGVncmF0aW9uLCBhdXRob3JpemVyT3B0aW9ucyk7IC8vIERlbGV0ZSBzdHVkZW50XG5cbiAgICAvLyBBc3NpZ25tZW50cyBlbmRwb2ludHMgKHByb3RlY3RlZCkgLSBFcGljIDdcbiAgICBjb25zdCBhc3NpZ25tZW50c1Jlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2Fzc2lnbm1lbnRzJyk7XG4gICAgYXNzaWdubWVudHNSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBhcGlJbnRlZ3JhdGlvbiwgYXV0aG9yaXplck9wdGlvbnMpOyAvLyBDcmVhdGUgYXNzaWdubWVudFxuICAgIGFzc2lnbm1lbnRzUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBhcGlJbnRlZ3JhdGlvbiwgYXV0aG9yaXplck9wdGlvbnMpOyAvLyBMaXN0IGFzc2lnbm1lbnRzXG4gICAgY29uc3QgYXNzaWdubWVudElkUmVzb3VyY2UgPSBhc3NpZ25tZW50c1Jlc291cmNlLmFkZFJlc291cmNlKCd7YXNzaWdubWVudF9pZH0nKTtcbiAgICBhc3NpZ25tZW50SWRSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIGFwaUludGVncmF0aW9uLCBhdXRob3JpemVyT3B0aW9ucyk7IC8vIEdldCBhc3NpZ25tZW50XG4gICAgY29uc3QgYXNzaWdubWVudFVwbG9hZFJlc291cmNlID0gYXNzaWdubWVudElkUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3VwbG9hZC11cmwnKTtcbiAgICBhc3NpZ25tZW50VXBsb2FkUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgYXBpSW50ZWdyYXRpb24sIGF1dGhvcml6ZXJPcHRpb25zKTsgLy8gR2V0IHByZXNpZ25lZCB1cGxvYWQgVVJMXG5cbiAgICAvLyBNZXRyaWNzIGVuZHBvaW50cyAocHJvdGVjdGVkKSAtIEVwaWMgOFxuICAgIGNvbnN0IG1ldHJpY3NSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdtZXRyaWNzJyk7XG4gICAgY29uc3QgbWV0cmljc0NsYXNzUmVzb3VyY2UgPSBtZXRyaWNzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2NsYXNzJyk7XG4gICAgY29uc3QgbWV0cmljc0NsYXNzSWRSZXNvdXJjZSA9IG1ldHJpY3NDbGFzc1Jlc291cmNlLmFkZFJlc291cmNlKCd7YXNzaWdubWVudF9pZH0nKTtcbiAgICBtZXRyaWNzQ2xhc3NJZFJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgYXBpSW50ZWdyYXRpb24sIGF1dGhvcml6ZXJPcHRpb25zKTsgLy8gR2V0IGNsYXNzIG1ldHJpY3NcbiAgICBjb25zdCBtZXRyaWNzU3R1ZGVudFJlc291cmNlID0gbWV0cmljc1Jlc291cmNlLmFkZFJlc291cmNlKCdzdHVkZW50Jyk7XG4gICAgY29uc3QgbWV0cmljc1N0dWRlbnRJZFJlc291cmNlID0gbWV0cmljc1N0dWRlbnRSZXNvdXJjZS5hZGRSZXNvdXJjZSgne3N0dWRlbnRfaWR9Jyk7XG4gICAgbWV0cmljc1N0dWRlbnRJZFJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgYXBpSW50ZWdyYXRpb24sIGF1dGhvcml6ZXJPcHRpb25zKTsgLy8gR2V0IHN0dWRlbnQgbWV0cmljc1xuXG4gICAgLy8gRXNzYXlzIGVuZHBvaW50cyAocHJvdGVjdGVkKSAtIEVwaWMgOFxuICAgIGNvbnN0IGVzc2F5c1Jlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2Vzc2F5cycpO1xuICAgIGNvbnN0IGVzc2F5SWRSZXNvdXJjZU92ZXJyaWRlID0gZXNzYXlzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3tlc3NheV9pZH0nKTtcbiAgICBjb25zdCBlc3NheU92ZXJyaWRlUmVzb3VyY2UgPSBlc3NheUlkUmVzb3VyY2VPdmVycmlkZS5hZGRSZXNvdXJjZSgnb3ZlcnJpZGUnKTtcbiAgICBlc3NheU92ZXJyaWRlUmVzb3VyY2UuYWRkTWV0aG9kKCdQQVRDSCcsIGFwaUludGVncmF0aW9uLCBhdXRob3JpemVyT3B0aW9ucyk7IC8vIE92ZXJyaWRlIGVzc2F5IGZlZWRiYWNrXG5cbiAgICAvLyBQcm9jZXNzb3IgTGFtYmRhIEZ1bmN0aW9uIChDb250YWluZXIgSW1hZ2UpXG4gICAgLy8gVXNpbmcgY29udGFpbmVyIGltYWdlIGluc3RlYWQgb2YgbGF5ZXIgZHVlIHRvIHNpemUgbGltaXRzIChzcGFDeSArIG1vZGVsID4gMjUwTUIpXG4gICAgY29uc3QgcHJvY2Vzc29yTGFtYmRhID0gbmV3IGxhbWJkYS5Eb2NrZXJJbWFnZUZ1bmN0aW9uKHRoaXMsICdQcm9jZXNzb3JMYW1iZGEnLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6ICd2aW5jZW50LXZvY2FiLXByb2Nlc3Nvci1sYW1iZGEnLFxuICAgICAgY29kZTogbGFtYmRhLkRvY2tlckltYWdlQ29kZS5mcm9tSW1hZ2VBc3NldChcbiAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYS9wcm9jZXNzb3InKSxcbiAgICAgICAge1xuICAgICAgICAgIC8vIERvY2tlcmZpbGUgaXMgaW4gbGFtYmRhL3Byb2Nlc3Nvci9Eb2NrZXJmaWxlXG4gICAgICAgIH1cbiAgICAgICksXG4gICAgICByb2xlOiBwcm9jZXNzb3JMYW1iZGFSb2xlLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksIC8vIE11c3QgbWF0Y2ggU1FTIHZpc2liaWxpdHkgdGltZW91dFxuICAgICAgbWVtb3J5U2l6ZTogMzAwOCwgLy8gSGlnaCBtZW1vcnkgZm9yIHNwYUN5IG1vZGVsIGxvYWRpbmdcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEVTU0FZU19CVUNLRVQ6IGVzc2F5c0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICBNRVRSSUNTX1RBQkxFOiBtZXRyaWNzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBCRURST0NLX01PREVMX0lEOiAnYW50aHJvcGljLmNsYXVkZS0zLXNvbm5ldC0yMDI0MDIyOS12MTowJyxcbiAgICAgICAgRVNTQVlfVVBEQVRFX1FVRVVFX1VSTDogZXNzYXlVcGRhdGVRdWV1ZS5xdWV1ZVVybCxcbiAgICAgICAgLy8gQVdTX1JFR0lPTiBpcyBhdXRvbWF0aWNhbGx5IHNldCBieSBMYW1iZGEgcnVudGltZVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFNRUyBFdmVudCBTb3VyY2UgZm9yIFByb2Nlc3NvciBMYW1iZGFcbiAgICBwcm9jZXNzb3JMYW1iZGEuYWRkRXZlbnRTb3VyY2UoXG4gICAgICBuZXcgbGFtYmRhRXZlbnRTb3VyY2VzLlNxc0V2ZW50U291cmNlKHByb2Nlc3NpbmdRdWV1ZSwge1xuICAgICAgICBiYXRjaFNpemU6IDEsIC8vIFByb2Nlc3Mgb25lIGVzc2F5IGF0IGEgdGltZVxuICAgICAgICBtYXhCYXRjaGluZ1dpbmRvdzogY2RrLkR1cmF0aW9uLnNlY29uZHMoMCksXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIEVwaWMgNzogQWdncmVnYXRpb24gTGFtYmRhXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIC8vIElBTSBSb2xlIGZvciBBZ2dyZWdhdGlvbiBMYW1iZGFcbiAgICBjb25zdCBhZ2dyZWdhdGlvbkxhbWJkYVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0FnZ3JlZ2F0aW9uTGFtYmRhUm9sZScsIHtcbiAgICAgIHJvbGVOYW1lOiAndmluY2VudC12b2NhYi1hZ2dyZWdhdGlvbi1sYW1iZGEtcm9sZScsXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnSUFNIHJvbGUgZm9yIGFnZ3JlZ2F0aW9uIExhbWJkYSBmdW5jdGlvbicsXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJyksXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgcGVybWlzc2lvbnMgZm9yIEFnZ3JlZ2F0aW9uIExhbWJkYVxuICAgIG1ldHJpY3NUYWJsZS5ncmFudFJlYWREYXRhKGFnZ3JlZ2F0aW9uTGFtYmRhUm9sZSk7XG4gICAgY2xhc3NNZXRyaWNzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGFnZ3JlZ2F0aW9uTGFtYmRhUm9sZSk7XG4gICAgc3R1ZGVudE1ldHJpY3NUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoYWdncmVnYXRpb25MYW1iZGFSb2xlKTtcbiAgICBlc3NheVVwZGF0ZVF1ZXVlLmdyYW50Q29uc3VtZU1lc3NhZ2VzKGFnZ3JlZ2F0aW9uTGFtYmRhUm9sZSk7XG5cbiAgICAvLyBBZ2dyZWdhdGlvbiBMYW1iZGEgRnVuY3Rpb24gKGZvciBDbGFzc01ldHJpY3MpXG4gICAgY29uc3QgYWdncmVnYXRpb25MYW1iZGFDb2RlID0gcHJvY2Vzcy5lbnYuQ0RLX1NLSVBfQlVORExJTkcgPT09ICd0cnVlJ1xuICAgICAgPyBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYS9hZ2dyZWdhdGlvbnMnKSlcbiAgICAgIDogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGEvYWdncmVnYXRpb25zJyksIHtcbiAgICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgICAgaW1hZ2U6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzEyLmJ1bmRsaW5nSW1hZ2UsXG4gICAgICAgICAgICBjb21tYW5kOiBbXG4gICAgICAgICAgICAgICdiYXNoJywgJy1jJyxcbiAgICAgICAgICAgICAgJ3BpcCBpbnN0YWxsIC1yIHJlcXVpcmVtZW50cy50eHQgLXQgL2Fzc2V0LW91dHB1dCAmJiBjcCAtYXUgLiAvYXNzZXQtb3V0cHV0JyxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICBjb25zdCBhZ2dyZWdhdGlvbkxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0FnZ3JlZ2F0aW9uTGFtYmRhJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiAndmluY2VudC12b2NhYi1hZ2dyZWdhdGlvbi1sYW1iZGEnLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTIsXG4gICAgICBoYW5kbGVyOiAnY2xhc3NfbWV0cmljcy5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGFnZ3JlZ2F0aW9uTGFtYmRhQ29kZSxcbiAgICAgIHJvbGU6IGFnZ3JlZ2F0aW9uTGFtYmRhUm9sZSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDIpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgTUVUUklDU19UQUJMRTogbWV0cmljc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgQ0xBU1NfTUVUUklDU19UQUJMRTogY2xhc3NNZXRyaWNzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBTVFVERU5UX01FVFJJQ1NfVEFCTEU6IHN0dWRlbnRNZXRyaWNzVGFibGUudGFibGVOYW1lLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFNRUyBFdmVudCBTb3VyY2UgZm9yIEFnZ3JlZ2F0aW9uIExhbWJkYVxuICAgIGFnZ3JlZ2F0aW9uTGFtYmRhLmFkZEV2ZW50U291cmNlKFxuICAgICAgbmV3IGxhbWJkYUV2ZW50U291cmNlcy5TcXNFdmVudFNvdXJjZShlc3NheVVwZGF0ZVF1ZXVlLCB7XG4gICAgICAgIGJhdGNoU2l6ZTogMTAsIC8vIFByb2Nlc3MgdXAgdG8gMTAgdXBkYXRlcyBhdCBhIHRpbWVcbiAgICAgICAgbWF4QmF0Y2hpbmdXaW5kb3c6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIEdyYW50IFByb2Nlc3NvciBMYW1iZGEgcGVybWlzc2lvbiB0byBzZW5kIG1lc3NhZ2VzIHRvIEVzc2F5VXBkYXRlUXVldWVcbiAgICBwcm9jZXNzb3JMYW1iZGFSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFsnc3FzOlNlbmRNZXNzYWdlJ10sXG4gICAgICAgIHJlc291cmNlczogW2Vzc2F5VXBkYXRlUXVldWUucXVldWVBcm5dLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBDbG91ZFdhdGNoIE9ic2VydmFiaWxpdHkgKEVwaWMgNSlcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gU05TIFRvcGljIGZvciBhbGFybSBub3RpZmljYXRpb25zIChvcHRpb25hbCAtIGNhbiBiZSBjb25maWd1cmVkIGxhdGVyKVxuICAgIGNvbnN0IGFsYXJtVG9waWMgPSBuZXcgc25zLlRvcGljKHRoaXMsICdBbGFybVRvcGljJywge1xuICAgICAgZGlzcGxheU5hbWU6ICd2aW5jZW50LXZvY2FiLWVzc2F5LWFuYWx5emVyLWFsYXJtcycsXG4gICAgfSk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIEFsYXJtOiBBUEkgTGFtYmRhIEVycm9yc1xuICAgIGNvbnN0IGFwaUxhbWJkYUVycm9yQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnQXBpTGFtYmRhRXJyb3JBbGFybScsIHtcbiAgICAgIGFsYXJtTmFtZTogJ3ZpbmNlbnQtdm9jYWItYXBpLWxhbWJkYS1lcnJvcnMnLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ0FsZXJ0cyB3aGVuIEFQSSBMYW1iZGEgZXJyb3JzIGV4Y2VlZCB0aHJlc2hvbGQnLFxuICAgICAgbWV0cmljOiBhcGlMYW1iZGEubWV0cmljRXJyb3JzKHtcbiAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiA1LCAvLyBBbGVydCBpZiA1KyBlcnJvcnMgaW4gNSBtaW51dGVzXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuICAgIGFwaUxhbWJkYUVycm9yQWxhcm0uYWRkQWxhcm1BY3Rpb24obmV3IGNsb3Vkd2F0Y2hBY3Rpb25zLlNuc0FjdGlvbihhbGFybVRvcGljKSk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIEFsYXJtOiBTMyBVcGxvYWQgTGFtYmRhIEVycm9yc1xuICAgIGNvbnN0IHMzVXBsb2FkTGFtYmRhRXJyb3JBbGFybSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdTM1VwbG9hZExhbWJkYUVycm9yQWxhcm0nLCB7XG4gICAgICBhbGFybU5hbWU6ICd2aW5jZW50LXZvY2FiLXMzLXVwbG9hZC1sYW1iZGEtZXJyb3JzJyxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246ICdBbGVydHMgd2hlbiBTMyBVcGxvYWQgTGFtYmRhIGVycm9ycyBleGNlZWQgdGhyZXNob2xkJyxcbiAgICAgIG1ldHJpYzogczNVcGxvYWRMYW1iZGEubWV0cmljRXJyb3JzKHtcbiAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiA1LCAvLyBBbGVydCBpZiA1KyBlcnJvcnMgaW4gNSBtaW51dGVzXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuICAgIHMzVXBsb2FkTGFtYmRhRXJyb3JBbGFybS5hZGRBbGFybUFjdGlvbihuZXcgY2xvdWR3YXRjaEFjdGlvbnMuU25zQWN0aW9uKGFsYXJtVG9waWMpKTtcblxuICAgIC8vIENsb3VkV2F0Y2ggQWxhcm06IFByb2Nlc3NvciBMYW1iZGEgRXJyb3JzXG4gICAgY29uc3QgcHJvY2Vzc29yTGFtYmRhRXJyb3JBbGFybSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdQcm9jZXNzb3JMYW1iZGFFcnJvckFsYXJtJywge1xuICAgICAgYWxhcm1OYW1lOiAndmluY2VudC12b2NhYi1wcm9jZXNzb3ItbGFtYmRhLWVycm9ycycsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnQWxlcnRzIHdoZW4gUHJvY2Vzc29yIExhbWJkYSBlcnJvcnMgZXhjZWVkIHRocmVzaG9sZCcsXG4gICAgICBtZXRyaWM6IHByb2Nlc3NvckxhbWJkYS5tZXRyaWNFcnJvcnMoe1xuICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDMsIC8vIEFsZXJ0IGlmIDMrIGVycm9ycyBpbiA1IG1pbnV0ZXMgKG1vcmUgY3JpdGljYWwpXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuICAgIHByb2Nlc3NvckxhbWJkYUVycm9yQWxhcm0uYWRkQWxhcm1BY3Rpb24obmV3IGNsb3Vkd2F0Y2hBY3Rpb25zLlNuc0FjdGlvbihhbGFybVRvcGljKSk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIEFsYXJtOiBEZWFkIExldHRlciBRdWV1ZSBNZXNzYWdlcyAoRmFpbGVkIFByb2Nlc3NpbmcpXG4gICAgY29uc3QgZGxxQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnRExRQWxhcm0nLCB7XG4gICAgICBhbGFybU5hbWU6ICd2aW5jZW50LXZvY2FiLWRscS1tZXNzYWdlcycsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnQWxlcnRzIHdoZW4gbWVzc2FnZXMgYXJlIHNlbnQgdG8gRExRIChwcm9jZXNzaW5nIGZhaWx1cmVzKScsXG4gICAgICBtZXRyaWM6IGRscS5tZXRyaWNBcHByb3hpbWF0ZU51bWJlck9mTWVzc2FnZXNWaXNpYmxlKHtcbiAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiAxLCAvLyBBbGVydCBpZiBhbnkgbWVzc2FnZSBpbiBETFFcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG4gICAgZGxxQWxhcm0uYWRkQWxhcm1BY3Rpb24obmV3IGNsb3Vkd2F0Y2hBY3Rpb25zLlNuc0FjdGlvbihhbGFybVRvcGljKSk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIEFsYXJtOiBQcm9jZXNzb3IgTGFtYmRhIFRocm90dGxlcyAoT3B0aW9uYWwpXG4gICAgY29uc3QgcHJvY2Vzc29yTGFtYmRhVGhyb3R0bGVBbGFybSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdQcm9jZXNzb3JMYW1iZGFUaHJvdHRsZUFsYXJtJywge1xuICAgICAgYWxhcm1OYW1lOiAndmluY2VudC12b2NhYi1wcm9jZXNzb3ItbGFtYmRhLXRocm90dGxlcycsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnQWxlcnRzIHdoZW4gUHJvY2Vzc29yIExhbWJkYSBpcyB0aHJvdHRsZWQnLFxuICAgICAgbWV0cmljOiBwcm9jZXNzb3JMYW1iZGEubWV0cmljVGhyb3R0bGVzKHtcbiAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiAxLCAvLyBBbGVydCBpZiBhbnkgdGhyb3R0bGVzXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuICAgIHByb2Nlc3NvckxhbWJkYVRocm90dGxlQWxhcm0uYWRkQWxhcm1BY3Rpb24obmV3IGNsb3Vkd2F0Y2hBY3Rpb25zLlNuc0FjdGlvbihhbGFybVRvcGljKSk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIEFsYXJtOiBQcm9jZXNzb3IgTGFtYmRhIER1cmF0aW9uIChIaWdoIER1cmF0aW9uIFdhcm5pbmcpXG4gICAgY29uc3QgcHJvY2Vzc29yTGFtYmRhRHVyYXRpb25BbGFybSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdQcm9jZXNzb3JMYW1iZGFEdXJhdGlvbkFsYXJtJywge1xuICAgICAgYWxhcm1OYW1lOiAndmluY2VudC12b2NhYi1wcm9jZXNzb3ItbGFtYmRhLWR1cmF0aW9uJyxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246ICdBbGVydHMgd2hlbiBQcm9jZXNzb3IgTGFtYmRhIGR1cmF0aW9uIGlzIGhpZ2ggKGFwcHJvYWNoaW5nIHRpbWVvdXQpJyxcbiAgICAgIG1ldHJpYzogcHJvY2Vzc29yTGFtYmRhLm1ldHJpY0R1cmF0aW9uKHtcbiAgICAgICAgc3RhdGlzdGljOiAnQXZlcmFnZScsXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogMjQwMDAwLCAvLyA0IG1pbnV0ZXMgKDgwJSBvZiA1LW1pbnV0ZSB0aW1lb3V0KVxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDIsIC8vIE11c3QgZXhjZWVkIHRocmVzaG9sZCBmb3IgMiBwZXJpb2RzXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcbiAgICBwcm9jZXNzb3JMYW1iZGFEdXJhdGlvbkFsYXJtLmFkZEFsYXJtQWN0aW9uKG5ldyBjbG91ZHdhdGNoQWN0aW9ucy5TbnNBY3Rpb24oYWxhcm1Ub3BpYykpO1xuXG4gICAgLy8gQ2xvdWRGb3JtYXRpb24gT3V0cHV0c1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdFc3NheXNCdWNrZXROYW1lJywge1xuICAgICAgdmFsdWU6IGVzc2F5c0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdTMyBidWNrZXQgbmFtZSBmb3IgZXNzYXkgc3RvcmFnZScsXG4gICAgICBleHBvcnROYW1lOiAnRXNzYXlzQnVja2V0TmFtZScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUHJvY2Vzc2luZ1F1ZXVlVXJsJywge1xuICAgICAgdmFsdWU6IHByb2Nlc3NpbmdRdWV1ZS5xdWV1ZVVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU1FTIHF1ZXVlIFVSTCBmb3IgZXNzYXkgcHJvY2Vzc2luZycsXG4gICAgICBleHBvcnROYW1lOiAnUHJvY2Vzc2luZ1F1ZXVlVXJsJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdNZXRyaWNzVGFibGVOYW1lJywge1xuICAgICAgdmFsdWU6IG1ldHJpY3NUYWJsZS50YWJsZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0R5bmFtb0RCIHRhYmxlIG5hbWUgZm9yIGVzc2F5IG1ldHJpY3MnLFxuICAgICAgZXhwb3J0TmFtZTogJ01ldHJpY3NUYWJsZU5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1RlYWNoZXJzVGFibGVOYW1lJywge1xuICAgICAgdmFsdWU6IHRlYWNoZXJzVGFibGUudGFibGVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdEeW5hbW9EQiB0YWJsZSBuYW1lIGZvciB0ZWFjaGVycycsXG4gICAgICBleHBvcnROYW1lOiAnVGVhY2hlcnNUYWJsZU5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1N0dWRlbnRzVGFibGVOYW1lJywge1xuICAgICAgdmFsdWU6IHN0dWRlbnRzVGFibGUudGFibGVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdEeW5hbW9EQiB0YWJsZSBuYW1lIGZvciBzdHVkZW50cycsXG4gICAgICBleHBvcnROYW1lOiAnU3R1ZGVudHNUYWJsZU5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Fzc2lnbm1lbnRzVGFibGVOYW1lJywge1xuICAgICAgdmFsdWU6IGFzc2lnbm1lbnRzVGFibGUudGFibGVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdEeW5hbW9EQiB0YWJsZSBuYW1lIGZvciBhc3NpZ25tZW50cycsXG4gICAgICBleHBvcnROYW1lOiAnQXNzaWdubWVudHNUYWJsZU5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0NsYXNzTWV0cmljc1RhYmxlTmFtZScsIHtcbiAgICAgIHZhbHVlOiBjbGFzc01ldHJpY3NUYWJsZS50YWJsZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0R5bmFtb0RCIHRhYmxlIG5hbWUgZm9yIGNsYXNzIG1ldHJpY3MnLFxuICAgICAgZXhwb3J0TmFtZTogJ0NsYXNzTWV0cmljc1RhYmxlTmFtZScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnU3R1ZGVudE1ldHJpY3NUYWJsZU5hbWUnLCB7XG4gICAgICB2YWx1ZTogc3R1ZGVudE1ldHJpY3NUYWJsZS50YWJsZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0R5bmFtb0RCIHRhYmxlIG5hbWUgZm9yIHN0dWRlbnQgbWV0cmljcycsXG4gICAgICBleHBvcnROYW1lOiAnU3R1ZGVudE1ldHJpY3NUYWJsZU5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaUxhbWJkYVJvbGVBcm4nLCB7XG4gICAgICB2YWx1ZTogYXBpTGFtYmRhUm9sZS5yb2xlQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdJQU0gcm9sZSBBUk4gZm9yIEFQSSBMYW1iZGEnLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwaUxhbWJkYVJvbGVBcm4nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1MzVXBsb2FkTGFtYmRhUm9sZUFybicsIHtcbiAgICAgIHZhbHVlOiBzM1VwbG9hZExhbWJkYVJvbGUucm9sZUFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnSUFNIHJvbGUgQVJOIGZvciBTMyB1cGxvYWQgdHJpZ2dlciBMYW1iZGEnLFxuICAgICAgZXhwb3J0TmFtZTogJ1MzVXBsb2FkTGFtYmRhUm9sZUFybicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUHJvY2Vzc29yTGFtYmRhUm9sZUFybicsIHtcbiAgICAgIHZhbHVlOiBwcm9jZXNzb3JMYW1iZGFSb2xlLnJvbGVBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0lBTSByb2xlIEFSTiBmb3IgcHJvY2Vzc29yIExhbWJkYScsXG4gICAgICBleHBvcnROYW1lOiAnUHJvY2Vzc29yTGFtYmRhUm9sZUFybicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBpVXJsJywge1xuICAgICAgdmFsdWU6IGFwaS51cmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBHYXRld2F5IGVuZHBvaW50IFVSTCcsXG4gICAgICBleHBvcnROYW1lOiAnQXBpVXJsJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQcm9jZXNzb3JMYW1iZGFBcm4nLCB7XG4gICAgICB2YWx1ZTogcHJvY2Vzc29yTGFtYmRhLmZ1bmN0aW9uQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdQcm9jZXNzb3IgTGFtYmRhIGZ1bmN0aW9uIEFSTicsXG4gICAgICBleHBvcnROYW1lOiAnUHJvY2Vzc29yTGFtYmRhQXJuJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBbGFybVRvcGljQXJuJywge1xuICAgICAgdmFsdWU6IGFsYXJtVG9waWMudG9waWNBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ1NOUyB0b3BpYyBBUk4gZm9yIENsb3VkV2F0Y2ggYWxhcm0gbm90aWZpY2F0aW9ucycsXG4gICAgICBleHBvcnROYW1lOiAnQWxhcm1Ub3BpY0FybicsXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIENvZ25pdG8gT3V0cHV0cyAoRXBpYyA2KVxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ29nbml0b1VzZXJQb29sSWQnLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgSUQgZm9yIHRlYWNoZXIgYXV0aGVudGljYXRpb24nLFxuICAgICAgZXhwb3J0TmFtZTogJ0NvZ25pdG9Vc2VyUG9vbElkJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDb2duaXRvVXNlclBvb2xDbGllbnRJZCcsIHtcbiAgICAgIHZhbHVlOiB1c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBDbGllbnQgSUQgZm9yIGZyb250ZW5kJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdDb2duaXRvVXNlclBvb2xDbGllbnRJZCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ29nbml0b1JlZ2lvbicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnJlZ2lvbixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVdTIHJlZ2lvbiBmb3IgQ29nbml0bycsXG4gICAgICBleHBvcnROYW1lOiAnQ29nbml0b1JlZ2lvbicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ29nbml0b0hvc3RlZFVpVXJsJywge1xuICAgICAgdmFsdWU6IGBodHRwczovLyR7dXNlclBvb2xEb21haW4uZG9tYWluTmFtZX0uYXV0aC4ke3RoaXMucmVnaW9ufS5hbWF6b25jb2duaXRvLmNvbWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gSG9zdGVkIFVJIFVSTCcsXG4gICAgICBleHBvcnROYW1lOiAnQ29nbml0b0hvc3RlZFVpVXJsJyxcbiAgICB9KTtcbiAgfVxufVxuIl19
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
        workerLambda.addEventSource(new lambdaEventSources.SqsEventSource(processingQueue, {
            batchSize: 10, // Process up to 10 messages at a time
            maxBatchingWindow: cdk.Duration.seconds(30),
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
exports.VocabRecommendationStack = VocabRecommendationStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidm9jYWJfcmVjb21tZW5kYXRpb24tc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2b2NhYl9yZWNvbW1lbmRhdGlvbi1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUVuQyx1REFBeUM7QUFDekMsbUVBQXFEO0FBQ3JELHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MsK0RBQWlEO0FBQ2pELHVFQUF5RDtBQUN6RCx5RkFBMkU7QUFDM0UsdUVBQXlEO0FBQ3pELHNGQUF3RTtBQUN4RSx5REFBMkM7QUFDM0MsaUVBQW1EO0FBQ25ELDJDQUE2QjtBQUU3QixNQUFhLHdCQUF5QixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3JELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsOEJBQThCO1FBQzlCLE1BQU0sWUFBWSxHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQ3ZELFVBQVUsRUFBRSx3QkFBd0IsSUFBSSxDQUFDLE9BQU8sSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFO1lBQ2pFLGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxtQ0FBbUM7WUFDN0UsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLHFEQUFxRDtZQUM5RSxTQUFTLEVBQUUsS0FBSztZQUNoQixVQUFVLEVBQUUsRUFBRSxDQUFDLGdCQUFnQixDQUFDLFVBQVU7WUFDMUMsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLGlCQUFpQixDQUFDLFNBQVM7WUFDakQsSUFBSSxFQUFFO2dCQUNKO29CQUNFLGNBQWMsRUFBRSxDQUFDLEdBQUcsQ0FBQztvQkFDckIsY0FBYyxFQUFFLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxHQUFHLEVBQUUs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VSxFQUFFLG1CQUFtQjtTQUNoQyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHlCQUF5QixFQUFFO1lBQ2pELEtBQUssRUFBRSxjQUFjLENBQUMsZ0JBQWdCO1lBQ3RDLFdBQVcsRUFBRSwwQ0FBMEM7WUFDdkQsVUFBVSxFQUFFLHlCQUF5QjtTQUN0QyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUN2QyxLQUFLLEVBQUUsSUFBSSxDQUFDLE1BQU07WUFDbEIsV0FBVyxFQUFFLHdCQUF3QjtZQUNyQyxVQUFVLEVBQUUsZUFBZTtTQUM1QixDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQzVDLEtBQUssRUFBRSxXQUFXLGNBQWMsQ0FBQyxVQUFVLFNBQVMsSUFBSSxDQUFDLE1BQU0sb0JBQW9CO1lBQ25GLFdBQVcsRUFBRSx1QkFBdUI7WUFDcEMsVUFBVSxFQUFFLG9CQUFvQjtTQUNqQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFwZkQsNERBb2ZDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XG5pbXBvcnQgKiBhcyBzcXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNxcyc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcbmltcG9ydCAqIGFzIGxhbWJkYUV2ZW50U291cmNlcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhLWV2ZW50LXNvdXJjZXMnO1xuaW1wb3J0ICogYXMgY2xvdWR3YXRjaCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaCc7XG5pbXBvcnQgKiBhcyBjbG91ZHdhdGNoQWN0aW9ucyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaC1hY3Rpb25zJztcbmltcG9ydCAqIGFzIHNucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zJztcbmltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZ25pdG8nO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuZXhwb3J0IGNsYXNzIFZvY2FiUmVjb21tZW5kYXRpb25TdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIC8vIFMzIEJ1Y2tldCBmb3IgZXNzYXkgdXBsb2Fkc1xuICAgIGNvbnN0IGVzc2F5c0J1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0Vzc2F5c0J1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGB2aW5jZW50LXZvY2FiLWVzc2F5cy0ke3RoaXMuYWNjb3VudH0tJHt0aGlzLnJlZ2lvbn1gLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSwgLy8gRm9yIFBvQyAtIGFsbG93cyBidWNrZXQgZGVsZXRpb25cbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLCAvLyBBdXRvbWF0aWNhbGx5IGRlbGV0ZSBvYmplY3RzIHdoZW4gc3RhY2sgaXMgZGVsZXRlZFxuICAgICAgdmVyc2lvbmVkOiBmYWxzZSxcbiAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICBjb3JzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhbGxvd2VkT3JpZ2luczogWycqJ10sXG4gICAgICAgICAgYWxsb3dlZE1ldGhvZHM6IFtzMy5IdHRwTWV0aG9kcy5HRVQsIHMzLkh0dHBNZXRob2RzLlBVVCwgczMuSHR0cE1ldGhvZHMuUE9TVF0sXG4gICAgICAgICAgYWxsb3dlZEhlYWRlcnM6IFsnKiddLFxuICAgICAgICAgIG1heEFnZTogMzYwMCxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBTUVMgRGVhZCBMZXR0ZXIgUXVldWVcbiAgICBjb25zdCBkbHEgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsICdQcm9jZXNzaW5nRExRJywge1xuICAgICAgcXVldWVOYW1lOiAndmluY2VudC12b2NhYi1lc3NheS1wcm9jZXNzaW5nLWRscScsXG4gICAgICByZXRlbnRpb25QZXJpb2Q6IGNkay5EdXJhdGlvbi5kYXlzKDE0KSxcbiAgICAgIGVuY3J5cHRpb246IHNxcy5RdWV1ZUVuY3J5cHRpb24uU1FTX01BTkFHRUQsXG4gICAgfSk7XG5cbiAgICAvLyBTUVMgUXVldWUgZm9yIGVzc2F5IHByb2Nlc3NpbmdcbiAgICBjb25zdCBwcm9jZXNzaW5nUXVldWUgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsICdFc3NheVByb2Nlc3NpbmdRdWV1ZScsIHtcbiAgICAgIHF1ZXVlTmFtZTogJ3ZpbmNlbnQtdm9jYWItZXNzYXktcHJvY2Vzc2luZy1xdWV1ZScsXG4gICAgICB2aXNpYmlsaXR5VGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksIC8vIE11c3QgYmUgPj0gTGFtYmRhIHRpbWVvdXRcbiAgICAgIHJldGVudGlvblBlcmlvZDogY2RrLkR1cmF0aW9uLmRheXMoMTQpLFxuICAgICAgZW5jcnlwdGlvbjogc3FzLlF1ZXVlRW5jcnlwdGlvbi5TUVNfTUFOQUdFRCxcbiAgICAgIGRlYWRMZXR0ZXJRdWV1ZToge1xuICAgICAgICBxdWV1ZTogZGxxLFxuICAgICAgICBtYXhSZWNlaXZlQ291bnQ6IDMsIC8vIFJldHJ5IDMgdGltZXMgYmVmb3JlIHNlbmRpbmcgdG8gRExRXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gRXNzYXlVcGRhdGVRdWV1ZSByZW1vdmVkIC0gbm8gbG9uZ2VyIG5lZWRlZCBmb3IgYXN5bmMgYXJjaGl0ZWN0dXJlXG5cbiAgICAvLyBMZWdhY3kgRXNzYXlNZXRyaWNzIHRhYmxlIHJlbW92ZWQgLSByZXBsYWNlZCBieSBFc3NheXMgdGFibGVcblxuICAgIC8vIER5bmFtb0RCIFRhYmxlIGZvciB0ZWFjaGVycyAoRXBpYyA2KVxuICAgIGNvbnN0IHRlYWNoZXJzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ1RlYWNoZXJzJywge1xuICAgICAgdGFibGVOYW1lOiAnVmluY2VudFZvY2FiVGVhY2hlcnMnLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICd0ZWFjaGVyX2lkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgZW5jcnlwdGlvbjogZHluYW1vZGIuVGFibGVFbmNyeXB0aW9uLkFXU19NQU5BR0VELFxuICAgIH0pO1xuXG4gICAgLy8gRHluYW1vREIgVGFibGUgZm9yIHN0dWRlbnRzIChFcGljIDcpXG4gICAgY29uc3Qgc3R1ZGVudHNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnU3R1ZGVudHMnLCB7XG4gICAgICB0YWJsZU5hbWU6ICdWaW5jZW50Vm9jYWJTdHVkZW50cycsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ3RlYWNoZXJfaWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiAnc3R1ZGVudF9pZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGVuY3J5cHRpb246IGR5bmFtb2RiLlRhYmxlRW5jcnlwdGlvbi5BV1NfTUFOQUdFRCxcbiAgICB9KTtcblxuICAgIC8vIER5bmFtb0RCIFRhYmxlIGZvciBhc3NpZ25tZW50cyAoRXBpYyA3KVxuICAgIGNvbnN0IGFzc2lnbm1lbnRzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ0Fzc2lnbm1lbnRzJywge1xuICAgICAgdGFibGVOYW1lOiAnVmluY2VudFZvY2FiQXNzaWdubWVudHMnLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICd0ZWFjaGVyX2lkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogJ2Fzc2lnbm1lbnRfaWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQVdTX01BTkFHRUQsXG4gICAgfSk7XG5cbiAgICAvLyBMZWdhY3kgQ2xhc3NNZXRyaWNzIGFuZCBTdHVkZW50TWV0cmljcyB0YWJsZXMgcmVtb3ZlZCAtIG1ldHJpY3MgY29tcHV0ZWQgb24tZGVtYW5kIGZyb20gRXNzYXlzIHRhYmxlXG5cbiAgICAvLyBEeW5hbW9EQiBUYWJsZSBmb3IgRXNzYXlzIChuZXcgc2ltcGxpZmllZCBzY2hlbWEpXG4gICAgY29uc3QgZXNzYXlzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ0Vzc2F5cycsIHtcbiAgICAgIHRhYmxlTmFtZTogJ1ZpbmNlbnRWb2NhYkVzc2F5cycsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ2Fzc2lnbm1lbnRfaWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiAnZXNzYXlfaWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQVdTX01BTkFHRUQsXG4gICAgfSk7XG5cbiAgICAvLyBJQU0gUm9sZSBmb3IgQVBJIExhbWJkYSAod2lsbCBiZSB1c2VkIGluIEVwaWMgMilcbiAgICBjb25zdCBhcGlMYW1iZGFSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdBcGlMYW1iZGFSb2xlJywge1xuICAgICAgcm9sZU5hbWU6ICd2aW5jZW50LXZvY2FiLWFwaS1sYW1iZGEtcm9sZScsXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnSUFNIHJvbGUgZm9yIEFQSSBMYW1iZGEgZnVuY3Rpb24nLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZScpLFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IHBlcm1pc3Npb25zIGZvciBBUEkgTGFtYmRhXG4gICAgZXNzYXlzQnVja2V0LmdyYW50UmVhZFdyaXRlKGFwaUxhbWJkYVJvbGUpOyAvLyBTdGlsbCB1c2VkIGZvciBwcmVzaWduZWQgVVJMcyAob3B0aW9uYWwpXG4gICAgdGVhY2hlcnNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoYXBpTGFtYmRhUm9sZSk7XG4gICAgc3R1ZGVudHNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoYXBpTGFtYmRhUm9sZSk7XG4gICAgYXNzaWdubWVudHNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoYXBpTGFtYmRhUm9sZSk7XG4gICAgZXNzYXlzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGFwaUxhbWJkYVJvbGUpO1xuICAgIHByb2Nlc3NpbmdRdWV1ZS5ncmFudFNlbmRNZXNzYWdlcyhhcGlMYW1iZGFSb2xlKTtcbiAgICAvLyBMZWdhY3kgbWV0cmljcyB0YWJsZXMgcmVtb3ZlZCAtIG5vIGxvbmdlciBuZWVkZWRcblxuICAgIC8vIFMzIFVwbG9hZCBMYW1iZGEgYW5kIFByb2Nlc3NvciBUYXNrIFJvbGUgcmVtb3ZlZFxuICAgIC8vIEFsbCBwcm9jZXNzaW5nIG5vdyBoYW5kbGVkIGJ5IFdvcmtlciBMYW1iZGEgdmlhIFNRU1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBDb2duaXRvIFVzZXIgUG9vbCAoRXBpYyA2KSAtIE11c3QgYmUgYmVmb3JlIEFQSSBMYW1iZGFcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gQ29nbml0byBVc2VyIFBvb2wgZm9yIHRlYWNoZXIgYXV0aGVudGljYXRpb25cbiAgICBjb25zdCB1c2VyUG9vbCA9IG5ldyBjb2duaXRvLlVzZXJQb29sKHRoaXMsICdWb2NhYlRlYWNoZXJzUG9vbCcsIHtcbiAgICAgIHVzZXJQb29sTmFtZTogJ3ZpbmNlbnQtdm9jYWItdGVhY2hlcnMtcG9vbCcsXG4gICAgICBzaWduSW5BbGlhc2VzOiB7XG4gICAgICAgIGVtYWlsOiB0cnVlLFxuICAgICAgICB1c2VybmFtZTogZmFsc2UsXG4gICAgICB9LFxuICAgICAgYXV0b1ZlcmlmeToge1xuICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBwYXNzd29yZFBvbGljeToge1xuICAgICAgICBtaW5MZW5ndGg6IDgsXG4gICAgICAgIHJlcXVpcmVMb3dlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVVcHBlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVEaWdpdHM6IHRydWUsXG4gICAgICAgIHJlcXVpcmVTeW1ib2xzOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLCAvLyBGb3IgUG9DXG4gICAgICBtZmE6IGNvZ25pdG8uTWZhLk9GRiwgLy8gTm8gTUZBIGZvciBQb0NcbiAgICB9KTtcblxuICAgIC8vIENvZ25pdG8gVXNlciBQb29sIENsaWVudCBmb3IgZnJvbnRlbmRcbiAgICBjb25zdCB1c2VyUG9vbENsaWVudCA9IG5ldyBjb2duaXRvLlVzZXJQb29sQ2xpZW50KHRoaXMsICdWb2NhYlRlYWNoZXJzUG9vbENsaWVudCcsIHtcbiAgICAgIHVzZXJQb29sLFxuICAgICAgdXNlclBvb2xDbGllbnROYW1lOiAndmluY2VudC12b2NhYi10ZWFjaGVycy1jbGllbnQnLFxuICAgICAgZ2VuZXJhdGVTZWNyZXQ6IGZhbHNlLCAvLyBQdWJsaWMgY2xpZW50IGZvciBmcm9udGVuZFxuICAgICAgYXV0aEZsb3dzOiB7XG4gICAgICAgIHVzZXJQYXNzd29yZDogdHJ1ZSwgLy8gQWxsb3cgdXNlcm5hbWUvcGFzc3dvcmQgYXV0aFxuICAgICAgICB1c2VyU3JwOiB0cnVlLCAvLyBBbGxvdyBTUlAgYXV0aFxuICAgICAgfSxcbiAgICAgIHByZXZlbnRVc2VyRXhpc3RlbmNlRXJyb3JzOiB0cnVlLCAvLyBTZWN1cml0eSBiZXN0IHByYWN0aWNlXG4gICAgfSk7XG5cbiAgICAvLyBDb2duaXRvIFVzZXIgUG9vbCBEb21haW4gKGZvciBIb3N0ZWQgVUkpXG4gICAgY29uc3QgdXNlclBvb2xEb21haW4gPSB1c2VyUG9vbC5hZGREb21haW4oJ1ZvY2FiVGVhY2hlcnNQb29sRG9tYWluJywge1xuICAgICAgY29nbml0b0RvbWFpbjoge1xuICAgICAgICBkb21haW5QcmVmaXg6IGB2aW5jZW50LXZvY2FiLSR7dGhpcy5hY2NvdW50fWAsIC8vIE11c3QgYmUgZ2xvYmFsbHkgdW5pcXVlXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQVBJIExhbWJkYSBGdW5jdGlvblxuICAgIC8vIFNraXAgYnVuZGxpbmcgaW4gdGVzdCBlbnZpcm9ubWVudCAoRG9ja2VyIG5vdCBhdmFpbGFibGUpXG4gICAgY29uc3QgYXBpTGFtYmRhQ29kZSA9IHByb2Nlc3MuZW52LkNES19TS0lQX0JVTkRMSU5HID09PSAndHJ1ZSdcbiAgICAgID8gbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGEvYXBpJykpXG4gICAgICA6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhL2FwaScpLCB7XG4gICAgICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgICAgIGltYWdlOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMi5idW5kbGluZ0ltYWdlLFxuICAgICAgICAgICAgY29tbWFuZDogW1xuICAgICAgICAgICAgICAnYmFzaCcsICctYycsXG4gICAgICAgICAgICAgICdwaXAgaW5zdGFsbCAtciByZXF1aXJlbWVudHMudHh0IC10IC9hc3NldC1vdXRwdXQgJiYgJyArXG4gICAgICAgICAgICAgICdjcCAtciBhcHAgbGFtYmRhX2Z1bmN0aW9uLnB5IG1haW4ucHkgcHl0ZXN0LmluaSAvYXNzZXQtb3V0cHV0IDI+L2Rldi9udWxsIHx8IHRydWUnLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGV4Y2x1ZGU6IFsndmVudicsICdfX3B5Y2FjaGVfXycsICd0ZXN0cycsICcqLnB5YycsICcqLnB5bycsICcucHl0ZXN0X2NhY2hlJ10sXG4gICAgICAgIH0pO1xuICAgIFxuICAgIGNvbnN0IGFwaUxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0FwaUxhbWJkYScsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ3ZpbmNlbnQtdm9jYWItYXBpLWxhbWJkYScsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMixcbiAgICAgIGhhbmRsZXI6ICdsYW1iZGFfZnVuY3Rpb24uaGFuZGxlcicsXG4gICAgICBjb2RlOiBhcGlMYW1iZGFDb2RlLFxuICAgICAgcm9sZTogYXBpTGFtYmRhUm9sZSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEVTU0FZU19CVUNLRVQ6IGVzc2F5c0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICBFU1NBWVNfVEFCTEU6IGVzc2F5c1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgU1RVREVOVFNfVEFCTEU6IHN0dWRlbnRzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBBU1NJR05NRU5UU19UQUJMRTogYXNzaWdubWVudHNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIEVTU0FZX1BST0NFU1NJTkdfUVVFVUVfVVJMOiBwcm9jZXNzaW5nUXVldWUucXVldWVVcmwsXG4gICAgICAgIENPR05JVE9fVVNFUl9QT09MX0lEOiB1c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgICBDT0dOSVRPX1VTRVJfUE9PTF9DTElFTlRfSUQ6IHVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICAgIENPR05JVE9fUkVHSU9OOiB0aGlzLnJlZ2lvbixcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBTMyBVcGxvYWQgVHJpZ2dlciBMYW1iZGEgcmVtb3ZlZFxuICAgIC8vIEFsbCB1cGxvYWRzIG5vdyBoYW5kbGVkIHZpYSBBUEkgTGFtYmRhIC9lc3NheXMvYmF0Y2ggZW5kcG9pbnRcblxuICAgIC8vIEFQSSBHYXRld2F5XG4gICAgY29uc3QgYXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCAnVm9jYWJBcGknLCB7XG4gICAgICByZXN0QXBpTmFtZTogJ3ZpbmNlbnQtdm9jYWItZXNzYXktYW5hbHl6ZXItYXBpJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIGZvciB2b2NhYnVsYXJ5IGVzc2F5IGFuYWx5c2lzJyxcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xuICAgICAgICBhbGxvd09yaWdpbnM6IFtcbiAgICAgICAgICAnaHR0cHM6Ly92b2NhYi52aW5jZW50Y2hhbi5jbG91ZCcsXG4gICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCcsXG4gICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6NTE3MycsIC8vIFZpdGUgZGVmYXVsdCBwb3J0XG4gICAgICAgIF0sXG4gICAgICAgIGFsbG93TWV0aG9kczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9NRVRIT0RTLFxuICAgICAgICBhbGxvd0hlYWRlcnM6IFsnQ29udGVudC1UeXBlJywgJ1gtQW16LURhdGUnLCAnQXV0aG9yaXphdGlvbicsICdYLUFwaS1LZXknXSxcbiAgICAgICAgYWxsb3dDcmVkZW50aWFsczogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDb2duaXRvIEF1dGhvcml6ZXIgZm9yIEFQSSBHYXRld2F5XG4gICAgY29uc3QgY29nbml0b0F1dGhvcml6ZXIgPSBuZXcgYXBpZ2F0ZXdheS5Db2duaXRvVXNlclBvb2xzQXV0aG9yaXplcih0aGlzLCAnQ29nbml0b0F1dGhvcml6ZXInLCB7XG4gICAgICBjb2duaXRvVXNlclBvb2xzOiBbdXNlclBvb2xdLFxuICAgICAgYXV0aG9yaXplck5hbWU6ICd2aW5jZW50LXZvY2FiLWNvZ25pdG8tYXV0aG9yaXplcicsXG4gICAgICBpZGVudGl0eVNvdXJjZTogJ21ldGhvZC5yZXF1ZXN0LmhlYWRlci5BdXRob3JpemF0aW9uJyxcbiAgICB9KTtcblxuICAgIC8vIEFQSSBHYXRld2F5IEludGVncmF0aW9uXG4gICAgY29uc3QgYXBpSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihhcGlMYW1iZGEpO1xuXG4gICAgLy8gSGVhbHRoIGNoZWNrIGVuZHBvaW50IChwdWJsaWMsIG5vIGF1dGggcmVxdWlyZWQpXG4gICAgY29uc3QgaGVhbHRoUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnaGVhbHRoJyk7XG4gICAgaGVhbHRoUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBhcGlJbnRlZ3JhdGlvbik7XG5cbiAgICAvLyBBdXRoIGVuZHBvaW50IChwdWJsaWMsIG5vIGF1dGggcmVxdWlyZWQgZm9yIC9hdXRoL2hlYWx0aClcbiAgICBjb25zdCBhdXRoUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnYXV0aCcpO1xuICAgIGNvbnN0IGF1dGhIZWFsdGhSZXNvdXJjZSA9IGF1dGhSZXNvdXJjZS5hZGRSZXNvdXJjZSgnaGVhbHRoJyk7XG4gICAgYXV0aEhlYWx0aFJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgYXBpSW50ZWdyYXRpb24pO1xuXG4gICAgLy8gUHJvdGVjdGVkIGVuZHBvaW50cyAocmVxdWlyZSBDb2duaXRvIGF1dGhlbnRpY2F0aW9uKVxuICAgIGNvbnN0IGF1dGhvcml6ZXJPcHRpb25zID0ge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH07XG5cbiAgICAvLyBMZWdhY3kgL2Vzc2F5IGVuZHBvaW50cyByZW1vdmVkIC0gdXNlIC9lc3NheXMvYmF0Y2ggYW5kIC9lc3NheXMve2Vzc2F5X2lkfSBpbnN0ZWFkXG5cbiAgICAvLyBTdHVkZW50cyBlbmRwb2ludHMgKHByb3RlY3RlZCkgLSBFcGljIDdcbiAgICBjb25zdCBzdHVkZW50c1Jlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ3N0dWRlbnRzJyk7XG4gICAgc3R1ZGVudHNSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBhcGlJbnRlZ3JhdGlvbiwgYXV0aG9yaXplck9wdGlvbnMpOyAvLyBDcmVhdGUgc3R1ZGVudFxuICAgIHN0dWRlbnRzUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBhcGlJbnRlZ3JhdGlvbiwgYXV0aG9yaXplck9wdGlvbnMpOyAvLyBMaXN0IHN0dWRlbnRzXG4gICAgY29uc3Qgc3R1ZGVudElkUmVzb3VyY2UgPSBzdHVkZW50c1Jlc291cmNlLmFkZFJlc291cmNlKCd7c3R1ZGVudF9pZH0nKTtcbiAgICBzdHVkZW50SWRSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIGFwaUludGVncmF0aW9uLCBhdXRob3JpemVyT3B0aW9ucyk7IC8vIEdldCBzdHVkZW50XG4gICAgc3R1ZGVudElkUmVzb3VyY2UuYWRkTWV0aG9kKCdQQVRDSCcsIGFwaUludGVncmF0aW9uLCBhdXRob3JpemVyT3B0aW9ucyk7IC8vIFVwZGF0ZSBzdHVkZW50XG4gICAgc3R1ZGVudElkUmVzb3VyY2UuYWRkTWV0aG9kKCdERUxFVEUnLCBhcGlJbnRlZ3JhdGlvbiwgYXV0aG9yaXplck9wdGlvbnMpOyAvLyBEZWxldGUgc3R1ZGVudFxuXG4gICAgLy8gQXNzaWdubWVudHMgZW5kcG9pbnRzIChwcm90ZWN0ZWQpIC0gRXBpYyA3XG4gICAgY29uc3QgYXNzaWdubWVudHNSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdhc3NpZ25tZW50cycpO1xuICAgIGFzc2lnbm1lbnRzUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgYXBpSW50ZWdyYXRpb24sIGF1dGhvcml6ZXJPcHRpb25zKTsgLy8gQ3JlYXRlIGFzc2lnbm1lbnRcbiAgICBhc3NpZ25tZW50c1Jlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgYXBpSW50ZWdyYXRpb24sIGF1dGhvcml6ZXJPcHRpb25zKTsgLy8gTGlzdCBhc3NpZ25tZW50c1xuICAgIGNvbnN0IGFzc2lnbm1lbnRJZFJlc291cmNlID0gYXNzaWdubWVudHNSZXNvdXJjZS5hZGRSZXNvdXJjZSgne2Fzc2lnbm1lbnRfaWR9Jyk7XG4gICAgYXNzaWdubWVudElkUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBhcGlJbnRlZ3JhdGlvbiwgYXV0aG9yaXplck9wdGlvbnMpOyAvLyBHZXQgYXNzaWdubWVudFxuICAgIGNvbnN0IGFzc2lnbm1lbnRVcGxvYWRSZXNvdXJjZSA9IGFzc2lnbm1lbnRJZFJlc291cmNlLmFkZFJlc291cmNlKCd1cGxvYWQtdXJsJyk7XG4gICAgYXNzaWdubWVudFVwbG9hZFJlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIGFwaUludGVncmF0aW9uLCBhdXRob3JpemVyT3B0aW9ucyk7IC8vIEdldCBwcmVzaWduZWQgdXBsb2FkIFVSTFxuXG4gICAgLy8gTWV0cmljcyBlbmRwb2ludHMgKHByb3RlY3RlZCkgLSBFcGljIDhcbiAgICBjb25zdCBtZXRyaWNzUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnbWV0cmljcycpO1xuICAgIGNvbnN0IG1ldHJpY3NDbGFzc1Jlc291cmNlID0gbWV0cmljc1Jlc291cmNlLmFkZFJlc291cmNlKCdjbGFzcycpO1xuICAgIGNvbnN0IG1ldHJpY3NDbGFzc0lkUmVzb3VyY2UgPSBtZXRyaWNzQ2xhc3NSZXNvdXJjZS5hZGRSZXNvdXJjZSgne2Fzc2lnbm1lbnRfaWR9Jyk7XG4gICAgbWV0cmljc0NsYXNzSWRSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIGFwaUludGVncmF0aW9uLCBhdXRob3JpemVyT3B0aW9ucyk7IC8vIEdldCBjbGFzcyBtZXRyaWNzXG4gICAgY29uc3QgbWV0cmljc1N0dWRlbnRSZXNvdXJjZSA9IG1ldHJpY3NSZXNvdXJjZS5hZGRSZXNvdXJjZSgnc3R1ZGVudCcpO1xuICAgIGNvbnN0IG1ldHJpY3NTdHVkZW50SWRSZXNvdXJjZSA9IG1ldHJpY3NTdHVkZW50UmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3tzdHVkZW50X2lkfScpO1xuICAgIG1ldHJpY3NTdHVkZW50SWRSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIGFwaUludGVncmF0aW9uLCBhdXRob3JpemVyT3B0aW9ucyk7IC8vIEdldCBzdHVkZW50IG1ldHJpY3NcblxuICAgIC8vIEVzc2F5cyBlbmRwb2ludHNcbiAgICBjb25zdCBlc3NheXNSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdlc3NheXMnKTtcbiAgICBjb25zdCBlc3NheXNCYXRjaFJlc291cmNlID0gZXNzYXlzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2JhdGNoJyk7XG4gICAgZXNzYXlzQmF0Y2hSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBhcGlJbnRlZ3JhdGlvbiwgYXV0aG9yaXplck9wdGlvbnMpOyAvLyBQT1NUIC9lc3NheXMvYmF0Y2ggLSBiYXRjaCB1cGxvYWQgKHByb3RlY3RlZClcbiAgICBjb25zdCBlc3NheXNQdWJsaWNSZXNvdXJjZSA9IGVzc2F5c1Jlc291cmNlLmFkZFJlc291cmNlKCdwdWJsaWMnKTtcbiAgICBlc3NheXNQdWJsaWNSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBhcGlJbnRlZ3JhdGlvbik7IC8vIFBPU1QgL2Vzc2F5cy9wdWJsaWMgLSBwdWJsaWMgZGVtbyB1cGxvYWQgKG5vIGF1dGgpXG4gICAgY29uc3QgZXNzYXlJZFJlc291cmNlT3ZlcnJpZGUgPSBlc3NheXNSZXNvdXJjZS5hZGRSZXNvdXJjZSgne2Vzc2F5X2lkfScpO1xuICAgIGVzc2F5SWRSZXNvdXJjZU92ZXJyaWRlLmFkZE1ldGhvZCgnR0VUJywgYXBpSW50ZWdyYXRpb24pOyAvLyBHRVQgL2Vzc2F5cy97ZXNzYXlfaWR9IC0gZ2V0IGVzc2F5IChwdWJsaWMgZm9yIGRlbW8sIHByb3RlY3RlZCBmb3IgdXNlciBlc3NheXMpXG4gICAgY29uc3QgZXNzYXlPdmVycmlkZVJlc291cmNlID0gZXNzYXlJZFJlc291cmNlT3ZlcnJpZGUuYWRkUmVzb3VyY2UoJ292ZXJyaWRlJyk7XG4gICAgZXNzYXlPdmVycmlkZVJlc291cmNlLmFkZE1ldGhvZCgnUEFUQ0gnLCBhcGlJbnRlZ3JhdGlvbiwgYXV0aG9yaXplck9wdGlvbnMpOyAvLyBPdmVycmlkZSBlc3NheSBmZWVkYmFja1xuICAgIGNvbnN0IGVzc2F5c1N0dWRlbnRSZXNvdXJjZSA9IGVzc2F5c1Jlc291cmNlLmFkZFJlc291cmNlKCdzdHVkZW50Jyk7XG4gICAgY29uc3QgZXNzYXlzU3R1ZGVudElkUmVzb3VyY2UgPSBlc3NheXNTdHVkZW50UmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3tzdHVkZW50X2lkfScpO1xuICAgIGVzc2F5c1N0dWRlbnRJZFJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgYXBpSW50ZWdyYXRpb24sIGF1dGhvcml6ZXJPcHRpb25zKTsgLy8gTGlzdCBlc3NheXMgZm9yIHN0dWRlbnRcblxuICAgIC8vIEVDUywgQWdncmVnYXRpb24gTGFtYmRhcywgYW5kIEVzc2F5VXBkYXRlUXVldWUgcmVtb3ZlZFxuICAgIC8vIEFsbCBwcm9jZXNzaW5nIG5vdyBoYW5kbGVkIGJ5IFdvcmtlciBMYW1iZGEgdmlhIEVzc2F5UHJvY2Vzc2luZ1F1ZXVlXG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIFdvcmtlciBMYW1iZGEgKFNRUy10cmlnZ2VyZWQgZXNzYXkgcHJvY2Vzc29yKVxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBJQU0gUm9sZSBmb3IgV29ya2VyIExhbWJkYVxuICAgIGNvbnN0IHdvcmtlckxhbWJkYVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1dvcmtlckxhbWJkYVJvbGUnLCB7XG4gICAgICByb2xlTmFtZTogJ3ZpbmNlbnQtdm9jYWItd29ya2VyLWxhbWJkYS1yb2xlJyxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgZGVzY3JpcHRpb246ICdJQU0gcm9sZSBmb3IgV29ya2VyIExhbWJkYSBmdW5jdGlvbicsXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJyksXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgcGVybWlzc2lvbnMgZm9yIFdvcmtlciBMYW1iZGFcbiAgICBlc3NheXNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEod29ya2VyTGFtYmRhUm9sZSk7XG4gICAgcHJvY2Vzc2luZ1F1ZXVlLmdyYW50Q29uc3VtZU1lc3NhZ2VzKHdvcmtlckxhbWJkYVJvbGUpO1xuXG4gICAgLy8gV29ya2VyIExhbWJkYSBGdW5jdGlvblxuICAgIGNvbnN0IHdvcmtlckxhbWJkYUNvZGUgPSBwcm9jZXNzLmVudi5DREtfU0tJUF9CVU5ETElORyA9PT0gJ3RydWUnXG4gICAgICA/IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhL3dvcmtlcicpKVxuICAgICAgOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYS93b3JrZXInKSwge1xuICAgICAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgICAgICBpbWFnZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTIuYnVuZGxpbmdJbWFnZSxcbiAgICAgICAgICAgIGNvbW1hbmQ6IFtcbiAgICAgICAgICAgICAgJ2Jhc2gnLCAnLWMnLFxuICAgICAgICAgICAgICAncGlwIGluc3RhbGwgLXIgcmVxdWlyZW1lbnRzLnR4dCAtdCAvYXNzZXQtb3V0cHV0ICYmICcgK1xuICAgICAgICAgICAgICAnY3AgLXIgbGFtYmRhX2Z1bmN0aW9uLnB5IC9hc3NldC1vdXRwdXQgMj4vZGV2L251bGwgfHwgdHJ1ZScsXG4gICAgICAgICAgICBdLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgZXhjbHVkZTogWydfX3B5Y2FjaGVfXycsICcqLnB5YycsICcqLnB5byddLFxuICAgICAgICB9KTtcblxuICAgIGNvbnN0IHdvcmtlckxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1dvcmtlckxhbWJkYScsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ3ZpbmNlbnQtdm9jYWItd29ya2VyLWxhbWJkYScsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMixcbiAgICAgIGhhbmRsZXI6ICdsYW1iZGFfZnVuY3Rpb24uaGFuZGxlcicsXG4gICAgICBjb2RlOiB3b3JrZXJMYW1iZGFDb2RlLFxuICAgICAgcm9sZTogd29ya2VyTGFtYmRhUm9sZSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLCAvLyBNdXN0IGJlID49IFNRUyB2aXNpYmlsaXR5IHRpbWVvdXRcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEVTU0FZU19UQUJMRTogZXNzYXlzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBPUEVOQUlfQVBJX0tFWTogcHJvY2Vzcy5lbnYuT1BFTkFJX0FQSV9LRVkgfHwgJycsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gU1FTIEV2ZW50IFNvdXJjZSBmb3IgV29ya2VyIExhbWJkYVxuICAgIHdvcmtlckxhbWJkYS5hZGRFdmVudFNvdXJjZShcbiAgICAgIG5ldyBsYW1iZGFFdmVudFNvdXJjZXMuU3FzRXZlbnRTb3VyY2UocHJvY2Vzc2luZ1F1ZXVlLCB7XG4gICAgICAgIGJhdGNoU2l6ZTogMTAsIC8vIFByb2Nlc3MgdXAgdG8gMTAgbWVzc2FnZXMgYXQgYSB0aW1lXG4gICAgICAgIG1heEJhdGNoaW5nV2luZG93OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIENsb3VkV2F0Y2ggT2JzZXJ2YWJpbGl0eSAoRXBpYyA1KVxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBTTlMgVG9waWMgZm9yIGFsYXJtIG5vdGlmaWNhdGlvbnMgKG9wdGlvbmFsIC0gY2FuIGJlIGNvbmZpZ3VyZWQgbGF0ZXIpXG4gICAgY29uc3QgYWxhcm1Ub3BpYyA9IG5ldyBzbnMuVG9waWModGhpcywgJ0FsYXJtVG9waWMnLCB7XG4gICAgICBkaXNwbGF5TmFtZTogJ3ZpbmNlbnQtdm9jYWItZXNzYXktYW5hbHl6ZXItYWxhcm1zJyxcbiAgICB9KTtcblxuICAgIC8vIENsb3VkV2F0Y2ggQWxhcm06IEFQSSBMYW1iZGEgRXJyb3JzXG4gICAgY29uc3QgYXBpTGFtYmRhRXJyb3JBbGFybSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdBcGlMYW1iZGFFcnJvckFsYXJtJywge1xuICAgICAgYWxhcm1OYW1lOiAndmluY2VudC12b2NhYi1hcGktbGFtYmRhLWVycm9ycycsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnQWxlcnRzIHdoZW4gQVBJIExhbWJkYSBlcnJvcnMgZXhjZWVkIHRocmVzaG9sZCcsXG4gICAgICBtZXRyaWM6IGFwaUxhbWJkYS5tZXRyaWNFcnJvcnMoe1xuICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDUsIC8vIEFsZXJ0IGlmIDUrIGVycm9ycyBpbiA1IG1pbnV0ZXNcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG4gICAgYXBpTGFtYmRhRXJyb3JBbGFybS5hZGRBbGFybUFjdGlvbihuZXcgY2xvdWR3YXRjaEFjdGlvbnMuU25zQWN0aW9uKGFsYXJtVG9waWMpKTtcblxuICAgIC8vIENsb3VkV2F0Y2ggQWxhcm06IFdvcmtlciBMYW1iZGEgRXJyb3JzXG4gICAgY29uc3Qgd29ya2VyTGFtYmRhRXJyb3JBbGFybSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdXb3JrZXJMYW1iZGFFcnJvckFsYXJtJywge1xuICAgICAgYWxhcm1OYW1lOiAndmluY2VudC12b2NhYi13b3JrZXItbGFtYmRhLWVycm9ycycsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnQWxlcnRzIHdoZW4gV29ya2VyIExhbWJkYSBlcnJvcnMgZXhjZWVkIHRocmVzaG9sZCcsXG4gICAgICBtZXRyaWM6IHdvcmtlckxhbWJkYS5tZXRyaWNFcnJvcnMoe1xuICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDUsIC8vIEFsZXJ0IGlmIDUrIGVycm9ycyBpbiA1IG1pbnV0ZXNcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG4gICAgd29ya2VyTGFtYmRhRXJyb3JBbGFybS5hZGRBbGFybUFjdGlvbihuZXcgY2xvdWR3YXRjaEFjdGlvbnMuU25zQWN0aW9uKGFsYXJtVG9waWMpKTtcblxuICAgIC8vIENsb3VkV2F0Y2ggQWxhcm06IFNRUyBRdWV1ZSBEZXB0aFxuICAgIGNvbnN0IHNxc1F1ZXVlRGVwdGhBbGFybSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdTcXNRdWV1ZURlcHRoQWxhcm0nLCB7XG4gICAgICBhbGFybU5hbWU6ICd2aW5jZW50LXZvY2FiLXByb2Nlc3NpbmctcXVldWUtZGVwdGgnLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ0FsZXJ0cyB3aGVuIHByb2Nlc3NpbmcgcXVldWUgaGFzIG1vcmUgdGhhbiAxMCBtZXNzYWdlcycsXG4gICAgICBtZXRyaWM6IHByb2Nlc3NpbmdRdWV1ZS5tZXRyaWNBcHByb3hpbWF0ZU51bWJlck9mTWVzc2FnZXNWaXNpYmxlKHtcbiAgICAgICAgc3RhdGlzdGljOiAnQXZlcmFnZScsXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogMTAsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuICAgIHNxc1F1ZXVlRGVwdGhBbGFybS5hZGRBbGFybUFjdGlvbihuZXcgY2xvdWR3YXRjaEFjdGlvbnMuU25zQWN0aW9uKGFsYXJtVG9waWMpKTtcblxuICAgIC8vIEVDUy1yZWxhdGVkIGFsYXJtcyByZW1vdmVkXG5cbiAgICAvLyBDbG91ZFdhdGNoIEFsYXJtOiBEZWFkIExldHRlciBRdWV1ZSBNZXNzYWdlcyAoRmFpbGVkIFByb2Nlc3NpbmcpXG4gICAgY29uc3QgZGxxQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnRExRQWxhcm0nLCB7XG4gICAgICBhbGFybU5hbWU6ICd2aW5jZW50LXZvY2FiLWRscS1tZXNzYWdlcycsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnQWxlcnRzIHdoZW4gbWVzc2FnZXMgYXJlIHNlbnQgdG8gRExRIChwcm9jZXNzaW5nIGZhaWx1cmVzKScsXG4gICAgICBtZXRyaWM6IGRscS5tZXRyaWNBcHByb3hpbWF0ZU51bWJlck9mTWVzc2FnZXNWaXNpYmxlKHtcbiAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiAxLCAvLyBBbGVydCBpZiBhbnkgbWVzc2FnZSBpbiBETFFcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG4gICAgZGxxQWxhcm0uYWRkQWxhcm1BY3Rpb24obmV3IGNsb3Vkd2F0Y2hBY3Rpb25zLlNuc0FjdGlvbihhbGFybVRvcGljKSk7XG5cbiAgICAvLyBDbG91ZEZvcm1hdGlvbiBPdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Vzc2F5c0J1Y2tldE5hbWUnLCB7XG4gICAgICB2YWx1ZTogZXNzYXlzQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1MzIGJ1Y2tldCBuYW1lIGZvciBlc3NheSBzdG9yYWdlJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdFc3NheXNCdWNrZXROYW1lJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQcm9jZXNzaW5nUXVldWVVcmwnLCB7XG4gICAgICB2YWx1ZTogcHJvY2Vzc2luZ1F1ZXVlLnF1ZXVlVXJsLFxuICAgICAgZGVzY3JpcHRpb246ICdTUVMgcXVldWUgVVJMIGZvciBlc3NheSBwcm9jZXNzaW5nJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdQcm9jZXNzaW5nUXVldWVVcmwnLFxuICAgIH0pO1xuXG4gICAgLy8gTGVnYWN5IE1ldHJpY3NUYWJsZU5hbWUgb3V0cHV0IHJlbW92ZWQgLSB1c2UgRXNzYXlzVGFibGVOYW1lIGluc3RlYWRcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdFc3NheXNUYWJsZU5hbWUnLCB7XG4gICAgICB2YWx1ZTogZXNzYXlzVGFibGUudGFibGVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdEeW5hbW9EQiB0YWJsZSBuYW1lIGZvciBlc3NheXMnLFxuICAgICAgZXhwb3J0TmFtZTogJ0Vzc2F5c1RhYmxlTmFtZScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVGVhY2hlcnNUYWJsZU5hbWUnLCB7XG4gICAgICB2YWx1ZTogdGVhY2hlcnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0R5bmFtb0RCIHRhYmxlIG5hbWUgZm9yIHRlYWNoZXJzJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdUZWFjaGVyc1RhYmxlTmFtZScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnU3R1ZGVudHNUYWJsZU5hbWUnLCB7XG4gICAgICB2YWx1ZTogc3R1ZGVudHNUYWJsZS50YWJsZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0R5bmFtb0RCIHRhYmxlIG5hbWUgZm9yIHN0dWRlbnRzJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdTdHVkZW50c1RhYmxlTmFtZScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXNzaWdubWVudHNUYWJsZU5hbWUnLCB7XG4gICAgICB2YWx1ZTogYXNzaWdubWVudHNUYWJsZS50YWJsZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0R5bmFtb0RCIHRhYmxlIG5hbWUgZm9yIGFzc2lnbm1lbnRzJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdBc3NpZ25tZW50c1RhYmxlTmFtZScsXG4gICAgfSk7XG5cbiAgICAvLyBMZWdhY3kgQ2xhc3NNZXRyaWNzVGFibGVOYW1lIGFuZCBTdHVkZW50TWV0cmljc1RhYmxlTmFtZSBvdXRwdXRzIHJlbW92ZWRcbiAgICAvLyBNZXRyaWNzIGFyZSBub3cgY29tcHV0ZWQgb24tZGVtYW5kIGZyb20gRXNzYXlzIHRhYmxlXG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBpTGFtYmRhUm9sZUFybicsIHtcbiAgICAgIHZhbHVlOiBhcGlMYW1iZGFSb2xlLnJvbGVBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0lBTSByb2xlIEFSTiBmb3IgQVBJIExhbWJkYScsXG4gICAgICBleHBvcnROYW1lOiAnQXBpTGFtYmRhUm9sZUFybicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnV29ya2VyTGFtYmRhUm9sZUFybicsIHtcbiAgICAgIHZhbHVlOiB3b3JrZXJMYW1iZGFSb2xlLnJvbGVBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0lBTSByb2xlIEFSTiBmb3IgV29ya2VyIExhbWJkYScsXG4gICAgICBleHBvcnROYW1lOiAnV29ya2VyTGFtYmRhUm9sZUFybicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBpVXJsJywge1xuICAgICAgdmFsdWU6IGFwaS51cmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBHYXRld2F5IGVuZHBvaW50IFVSTCcsXG4gICAgICBleHBvcnROYW1lOiAnQXBpVXJsJyxcbiAgICB9KTtcblxuICAgIC8vIEVzc2F5c1RhYmxlTmFtZSBvdXRwdXQgYWxyZWFkeSBkZWZpbmVkIGFib3ZlIChsaW5lIDQyMilcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdXb3JrZXJMYW1iZGFGdW5jdGlvbk5hbWUnLCB7XG4gICAgICB2YWx1ZTogd29ya2VyTGFtYmRhLmZ1bmN0aW9uTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnV29ya2VyIExhbWJkYSBmdW5jdGlvbiBuYW1lJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdXb3JrZXJMYW1iZGFGdW5jdGlvbk5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FsYXJtVG9waWNBcm4nLCB7XG4gICAgICB2YWx1ZTogYWxhcm1Ub3BpYy50b3BpY0FybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnU05TIHRvcGljIEFSTiBmb3IgQ2xvdWRXYXRjaCBhbGFybSBub3RpZmljYXRpb25zJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdBbGFybVRvcGljQXJuJyxcbiAgICB9KTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gQ29nbml0byBPdXRwdXRzIChFcGljIDYpXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDb2duaXRvVXNlclBvb2xJZCcsIHtcbiAgICAgIHZhbHVlOiB1c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBJRCBmb3IgdGVhY2hlciBhdXRoZW50aWNhdGlvbicsXG4gICAgICBleHBvcnROYW1lOiAnQ29nbml0b1VzZXJQb29sSWQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0NvZ25pdG9Vc2VyUG9vbENsaWVudElkJywge1xuICAgICAgdmFsdWU6IHVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIENsaWVudCBJRCBmb3IgZnJvbnRlbmQnLFxuICAgICAgZXhwb3J0TmFtZTogJ0NvZ25pdG9Vc2VyUG9vbENsaWVudElkJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDb2duaXRvUmVnaW9uJywge1xuICAgICAgdmFsdWU6IHRoaXMucmVnaW9uLFxuICAgICAgZGVzY3JpcHRpb246ICdBV1MgcmVnaW9uIGZvciBDb2duaXRvJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdDb2duaXRvUmVnaW9uJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDb2duaXRvSG9zdGVkVWlVcmwnLCB7XG4gICAgICB2YWx1ZTogYGh0dHBzOi8vJHt1c2VyUG9vbERvbWFpbi5kb21haW5OYW1lfS5hdXRoLiR7dGhpcy5yZWdpb259LmFtYXpvbmNvZ25pdG8uY29tYCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBIb3N0ZWQgVUkgVVJMJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdDb2duaXRvSG9zdGVkVWlVcmwnLFxuICAgIH0pO1xuICB9XG59XG4iXX0=
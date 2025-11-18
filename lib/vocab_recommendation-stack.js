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
        // Essays endpoints (protected)
        const essaysResource = api.root.addResource('essays');
        const essaysBatchResource = essaysResource.addResource('batch');
        essaysBatchResource.addMethod('POST', apiIntegration, authorizerOptions); // POST /essays/batch - batch upload
        const essayIdResourceOverride = essaysResource.addResource('{essay_id}');
        essayIdResourceOverride.addMethod('GET', apiIntegration, authorizerOptions); // GET /essays/{essay_id} - get essay
        const essayOverrideResource = essayIdResourceOverride.addResource('override');
        essayOverrideResource.addMethod('PATCH', apiIntegration, authorizerOptions); // Override essay feedback
        const essaysStudentResource = essaysResource.addResource('student');
        const essaysStudentIdResource = essaysStudentResource.addResource('{student_id}');
        essaysStudentIdResource.addMethod('GET', apiIntegration, authorizerOptions); // List essays for student
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
        new cdk.CfnOutput(this, 'EssaysTableName', {
            value: essaysTable.tableName,
            description: 'DynamoDB table name for essays',
            exportName: 'EssaysTableName',
        });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidm9jYWJfcmVjb21tZW5kYXRpb24tc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2b2NhYl9yZWNvbW1lbmRhdGlvbi1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUVuQyx1REFBeUM7QUFDekMsbUVBQXFEO0FBQ3JELHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MsK0RBQWlEO0FBQ2pELHVFQUF5RDtBQUN6RCx5RkFBMkU7QUFDM0UsdUVBQXlEO0FBQ3pELHNGQUF3RTtBQUN4RSx5REFBMkM7QUFDM0MsaUVBQW1EO0FBQ25ELDJDQUE2QjtBQUU3QixNQUFhLHdCQUF5QixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3JELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsOEJBQThCO1FBQzlCLE1BQU0sWUFBWSxHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQ3ZELFVBQVUsRUFBRSx3QkFBd0IsSUFBSSxDQUFDLE9BQU8sSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFO1lBQ2pFLGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxtQ0FBbUM7WUFDN0UsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLHFEQUFxRDtZQUM5RSxTQUFTLEVBQUUsS0FBSztZQUNoQixVQUFVLEVBQUUsRUFBRSxDQUFDLGdCQUFnQixDQUFDLFVBQVU7WUFDMUMsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLGlCQUFpQixDQUFDLFNBQVM7WUFDakQsSUFBSSxFQUFFO2dCQUNKO29CQUNFLGNBQWMsRUFBRSxDQUFDLEdBQUcsQ0FBQztvQkFDckIsY0FBYyxFQUFFLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxHQUFHLEVBQUUs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QUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUseUJBQXlCLEVBQUU7WUFDakQsS0FBSyxFQUFFLGNBQWMsQ0FBQyxnQkFBZ0I7WUFDdEMsV0FBVyxFQUFFLDBDQUEwQztZQUN2RCxVQUFVLEVBQUUseUJBQXlCO1NBQ3RDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQ3ZDLEtBQUssRUFBRSxJQUFJLENBQUMsTUFBTTtZQUNsQixXQUFXLEVBQUUsd0JBQXdCO1lBQ3JDLFVBQVUsRUFBRSxlQUFlO1NBQzVCLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsb0JBQW9CLEVBQUU7WUFDNUMsS0FBSyxFQUFFLFdBQVcsY0FBYyxDQUFDLFVBQVUsU0FBUyxJQUFJLENBQUMsTUFBTSxvQkFBb0I7WUFDbkYsV0FBVyxFQUFFLHVCQUF1QjtZQUNwQyxVQUFVLEVBQUUsb0JBQW9CO1NBQ2pDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQWpmRCw0REFpZkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcbmltcG9ydCAqIGFzIHNxcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3FzJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgbGFtYmRhRXZlbnRTb3VyY2VzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEtZXZlbnQtc291cmNlcyc7XG5pbXBvcnQgKiBhcyBjbG91ZHdhdGNoIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZHdhdGNoJztcbmltcG9ydCAqIGFzIGNsb3Vkd2F0Y2hBY3Rpb25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZHdhdGNoLWFjdGlvbnMnO1xuaW1wb3J0ICogYXMgc25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zbnMnO1xuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuXG5leHBvcnQgY2xhc3MgVm9jYWJSZWNvbW1lbmRhdGlvblN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBjZGsuU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8gUzMgQnVja2V0IGZvciBlc3NheSB1cGxvYWRzXG4gICAgY29uc3QgZXNzYXlzQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnRXNzYXlzQnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYHZpbmNlbnQtdm9jYWItZXNzYXlzLSR7dGhpcy5hY2NvdW50fS0ke3RoaXMucmVnaW9ufWAsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLCAvLyBGb3IgUG9DIC0gYWxsb3dzIGJ1Y2tldCBkZWxldGlvblxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsIC8vIEF1dG9tYXRpY2FsbHkgZGVsZXRlIG9iamVjdHMgd2hlbiBzdGFjayBpcyBkZWxldGVkXG4gICAgICB2ZXJzaW9uZWQ6IGZhbHNlLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIGNvcnM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGFsbG93ZWRPcmlnaW5zOiBbJyonXSxcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogW3MzLkh0dHBNZXRob2RzLkdFVCwgczMuSHR0cE1ldGhvZHMuUFVULCBzMy5IdHRwTWV0aG9kcy5QT1NUXSxcbiAgICAgICAgICBhbGxvd2VkSGVhZGVyczogWycqJ10sXG4gICAgICAgICAgbWF4QWdlOiAzNjAwLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIFNRUyBEZWFkIExldHRlciBRdWV1ZVxuICAgIGNvbnN0IGRscSA9IG5ldyBzcXMuUXVldWUodGhpcywgJ1Byb2Nlc3NpbmdETFEnLCB7XG4gICAgICBxdWV1ZU5hbWU6ICd2aW5jZW50LXZvY2FiLWVzc2F5LXByb2Nlc3NpbmctZGxxJyxcbiAgICAgIHJldGVudGlvblBlcmlvZDogY2RrLkR1cmF0aW9uLmRheXMoMTQpLFxuICAgICAgZW5jcnlwdGlvbjogc3FzLlF1ZXVlRW5jcnlwdGlvbi5TUVNfTUFOQUdFRCxcbiAgICB9KTtcblxuICAgIC8vIFNRUyBRdWV1ZSBmb3IgZXNzYXkgcHJvY2Vzc2luZ1xuICAgIGNvbnN0IHByb2Nlc3NpbmdRdWV1ZSA9IG5ldyBzcXMuUXVldWUodGhpcywgJ0Vzc2F5UHJvY2Vzc2luZ1F1ZXVlJywge1xuICAgICAgcXVldWVOYW1lOiAndmluY2VudC12b2NhYi1lc3NheS1wcm9jZXNzaW5nLXF1ZXVlJyxcbiAgICAgIHZpc2liaWxpdHlUaW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSwgLy8gTXVzdCBiZSA+PSBMYW1iZGEgdGltZW91dFxuICAgICAgcmV0ZW50aW9uUGVyaW9kOiBjZGsuRHVyYXRpb24uZGF5cygxNCksXG4gICAgICBlbmNyeXB0aW9uOiBzcXMuUXVldWVFbmNyeXB0aW9uLlNRU19NQU5BR0VELFxuICAgICAgZGVhZExldHRlclF1ZXVlOiB7XG4gICAgICAgIHF1ZXVlOiBkbHEsXG4gICAgICAgIG1heFJlY2VpdmVDb3VudDogMywgLy8gUmV0cnkgMyB0aW1lcyBiZWZvcmUgc2VuZGluZyB0byBETFFcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBFc3NheVVwZGF0ZVF1ZXVlIHJlbW92ZWQgLSBubyBsb25nZXIgbmVlZGVkIGZvciBhc3luYyBhcmNoaXRlY3R1cmVcblxuICAgIC8vIExlZ2FjeSBFc3NheU1ldHJpY3MgdGFibGUgcmVtb3ZlZCAtIHJlcGxhY2VkIGJ5IEVzc2F5cyB0YWJsZVxuXG4gICAgLy8gRHluYW1vREIgVGFibGUgZm9yIHRlYWNoZXJzIChFcGljIDYpXG4gICAgY29uc3QgdGVhY2hlcnNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnVGVhY2hlcnMnLCB7XG4gICAgICB0YWJsZU5hbWU6ICdWaW5jZW50Vm9jYWJUZWFjaGVycycsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ3RlYWNoZXJfaWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQVdTX01BTkFHRUQsXG4gICAgfSk7XG5cbiAgICAvLyBEeW5hbW9EQiBUYWJsZSBmb3Igc3R1ZGVudHMgKEVwaWMgNylcbiAgICBjb25zdCBzdHVkZW50c1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdTdHVkZW50cycsIHtcbiAgICAgIHRhYmxlTmFtZTogJ1ZpbmNlbnRWb2NhYlN0dWRlbnRzJyxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAndGVhY2hlcl9pZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICdzdHVkZW50X2lkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgZW5jcnlwdGlvbjogZHluYW1vZGIuVGFibGVFbmNyeXB0aW9uLkFXU19NQU5BR0VELFxuICAgIH0pO1xuXG4gICAgLy8gRHluYW1vREIgVGFibGUgZm9yIGFzc2lnbm1lbnRzIChFcGljIDcpXG4gICAgY29uc3QgYXNzaWdubWVudHNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnQXNzaWdubWVudHMnLCB7XG4gICAgICB0YWJsZU5hbWU6ICdWaW5jZW50Vm9jYWJBc3NpZ25tZW50cycsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ3RlYWNoZXJfaWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiAnYXNzaWdubWVudF9pZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGVuY3J5cHRpb246IGR5bmFtb2RiLlRhYmxlRW5jcnlwdGlvbi5BV1NfTUFOQUdFRCxcbiAgICB9KTtcblxuICAgIC8vIExlZ2FjeSBDbGFzc01ldHJpY3MgYW5kIFN0dWRlbnRNZXRyaWNzIHRhYmxlcyByZW1vdmVkIC0gbWV0cmljcyBjb21wdXRlZCBvbi1kZW1hbmQgZnJvbSBFc3NheXMgdGFibGVcblxuICAgIC8vIER5bmFtb0RCIFRhYmxlIGZvciBFc3NheXMgKG5ldyBzaW1wbGlmaWVkIHNjaGVtYSlcbiAgICBjb25zdCBlc3NheXNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnRXNzYXlzJywge1xuICAgICAgdGFibGVOYW1lOiAnVmluY2VudFZvY2FiRXNzYXlzJyxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAnYXNzaWdubWVudF9pZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICdlc3NheV9pZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGVuY3J5cHRpb246IGR5bmFtb2RiLlRhYmxlRW5jcnlwdGlvbi5BV1NfTUFOQUdFRCxcbiAgICB9KTtcblxuICAgIC8vIElBTSBSb2xlIGZvciBBUEkgTGFtYmRhICh3aWxsIGJlIHVzZWQgaW4gRXBpYyAyKVxuICAgIGNvbnN0IGFwaUxhbWJkYVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0FwaUxhbWJkYVJvbGUnLCB7XG4gICAgICByb2xlTmFtZTogJ3ZpbmNlbnQtdm9jYWItYXBpLWxhbWJkYS1yb2xlJyxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgZGVzY3JpcHRpb246ICdJQU0gcm9sZSBmb3IgQVBJIExhbWJkYSBmdW5jdGlvbicsXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJyksXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgcGVybWlzc2lvbnMgZm9yIEFQSSBMYW1iZGFcbiAgICBlc3NheXNCdWNrZXQuZ3JhbnRSZWFkV3JpdGUoYXBpTGFtYmRhUm9sZSk7IC8vIFN0aWxsIHVzZWQgZm9yIHByZXNpZ25lZCBVUkxzIChvcHRpb25hbClcbiAgICB0ZWFjaGVyc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShhcGlMYW1iZGFSb2xlKTtcbiAgICBzdHVkZW50c1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShhcGlMYW1iZGFSb2xlKTtcbiAgICBhc3NpZ25tZW50c1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShhcGlMYW1iZGFSb2xlKTtcbiAgICBlc3NheXNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoYXBpTGFtYmRhUm9sZSk7XG4gICAgcHJvY2Vzc2luZ1F1ZXVlLmdyYW50U2VuZE1lc3NhZ2VzKGFwaUxhbWJkYVJvbGUpO1xuICAgIC8vIExlZ2FjeSBtZXRyaWNzIHRhYmxlcyByZW1vdmVkIC0gbm8gbG9uZ2VyIG5lZWRlZFxuXG4gICAgLy8gUzMgVXBsb2FkIExhbWJkYSBhbmQgUHJvY2Vzc29yIFRhc2sgUm9sZSByZW1vdmVkXG4gICAgLy8gQWxsIHByb2Nlc3Npbmcgbm93IGhhbmRsZWQgYnkgV29ya2VyIExhbWJkYSB2aWEgU1FTXG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIENvZ25pdG8gVXNlciBQb29sIChFcGljIDYpIC0gTXVzdCBiZSBiZWZvcmUgQVBJIExhbWJkYVxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBDb2duaXRvIFVzZXIgUG9vbCBmb3IgdGVhY2hlciBhdXRoZW50aWNhdGlvblxuICAgIGNvbnN0IHVzZXJQb29sID0gbmV3IGNvZ25pdG8uVXNlclBvb2wodGhpcywgJ1ZvY2FiVGVhY2hlcnNQb29sJywge1xuICAgICAgdXNlclBvb2xOYW1lOiAndmluY2VudC12b2NhYi10ZWFjaGVycy1wb29sJyxcbiAgICAgIHNpZ25JbkFsaWFzZXM6IHtcbiAgICAgICAgZW1haWw6IHRydWUsXG4gICAgICAgIHVzZXJuYW1lOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgICBhdXRvVmVyaWZ5OiB7XG4gICAgICAgIGVtYWlsOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIHBhc3N3b3JkUG9saWN5OiB7XG4gICAgICAgIG1pbkxlbmd0aDogOCxcbiAgICAgICAgcmVxdWlyZUxvd2VyY2FzZTogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZVVwcGVyY2FzZTogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZURpZ2l0czogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZVN5bWJvbHM6IGZhbHNlLFxuICAgICAgfSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksIC8vIEZvciBQb0NcbiAgICAgIG1mYTogY29nbml0by5NZmEuT0ZGLCAvLyBObyBNRkEgZm9yIFBvQ1xuICAgIH0pO1xuXG4gICAgLy8gQ29nbml0byBVc2VyIFBvb2wgQ2xpZW50IGZvciBmcm9udGVuZFxuICAgIGNvbnN0IHVzZXJQb29sQ2xpZW50ID0gbmV3IGNvZ25pdG8uVXNlclBvb2xDbGllbnQodGhpcywgJ1ZvY2FiVGVhY2hlcnNQb29sQ2xpZW50Jywge1xuICAgICAgdXNlclBvb2wsXG4gICAgICB1c2VyUG9vbENsaWVudE5hbWU6ICd2aW5jZW50LXZvY2FiLXRlYWNoZXJzLWNsaWVudCcsXG4gICAgICBnZW5lcmF0ZVNlY3JldDogZmFsc2UsIC8vIFB1YmxpYyBjbGllbnQgZm9yIGZyb250ZW5kXG4gICAgICBhdXRoRmxvd3M6IHtcbiAgICAgICAgdXNlclBhc3N3b3JkOiB0cnVlLCAvLyBBbGxvdyB1c2VybmFtZS9wYXNzd29yZCBhdXRoXG4gICAgICAgIHVzZXJTcnA6IHRydWUsIC8vIEFsbG93IFNSUCBhdXRoXG4gICAgICB9LFxuICAgICAgcHJldmVudFVzZXJFeGlzdGVuY2VFcnJvcnM6IHRydWUsIC8vIFNlY3VyaXR5IGJlc3QgcHJhY3RpY2VcbiAgICB9KTtcblxuICAgIC8vIENvZ25pdG8gVXNlciBQb29sIERvbWFpbiAoZm9yIEhvc3RlZCBVSSlcbiAgICBjb25zdCB1c2VyUG9vbERvbWFpbiA9IHVzZXJQb29sLmFkZERvbWFpbignVm9jYWJUZWFjaGVyc1Bvb2xEb21haW4nLCB7XG4gICAgICBjb2duaXRvRG9tYWluOiB7XG4gICAgICAgIGRvbWFpblByZWZpeDogYHZpbmNlbnQtdm9jYWItJHt0aGlzLmFjY291bnR9YCwgLy8gTXVzdCBiZSBnbG9iYWxseSB1bmlxdWVcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBBUEkgTGFtYmRhIEZ1bmN0aW9uXG4gICAgLy8gU2tpcCBidW5kbGluZyBpbiB0ZXN0IGVudmlyb25tZW50IChEb2NrZXIgbm90IGF2YWlsYWJsZSlcbiAgICBjb25zdCBhcGlMYW1iZGFDb2RlID0gcHJvY2Vzcy5lbnYuQ0RLX1NLSVBfQlVORExJTkcgPT09ICd0cnVlJ1xuICAgICAgPyBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYS9hcGknKSlcbiAgICAgIDogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGEvYXBpJyksIHtcbiAgICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgICAgaW1hZ2U6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzEyLmJ1bmRsaW5nSW1hZ2UsXG4gICAgICAgICAgICBjb21tYW5kOiBbXG4gICAgICAgICAgICAgICdiYXNoJywgJy1jJyxcbiAgICAgICAgICAgICAgJ3BpcCBpbnN0YWxsIC1yIHJlcXVpcmVtZW50cy50eHQgLXQgL2Fzc2V0LW91dHB1dCAmJiAnICtcbiAgICAgICAgICAgICAgJ2NwIC1yIGFwcCBsYW1iZGFfZnVuY3Rpb24ucHkgbWFpbi5weSBweXRlc3QuaW5pIC9hc3NldC1vdXRwdXQgMj4vZGV2L251bGwgfHwgdHJ1ZScsXG4gICAgICAgICAgICBdLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgZXhjbHVkZTogWyd2ZW52JywgJ19fcHljYWNoZV9fJywgJ3Rlc3RzJywgJyoucHljJywgJyoucHlvJywgJy5weXRlc3RfY2FjaGUnXSxcbiAgICAgICAgfSk7XG4gICAgXG4gICAgY29uc3QgYXBpTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQXBpTGFtYmRhJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiAndmluY2VudC12b2NhYi1hcGktbGFtYmRhJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzEyLFxuICAgICAgaGFuZGxlcjogJ2xhbWJkYV9mdW5jdGlvbi5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGFwaUxhbWJkYUNvZGUsXG4gICAgICByb2xlOiBhcGlMYW1iZGFSb2xlLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgRVNTQVlTX0JVQ0tFVDogZXNzYXlzQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIEVTU0FZU19UQUJMRTogZXNzYXlzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBTVFVERU5UU19UQUJMRTogc3R1ZGVudHNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIEFTU0lHTk1FTlRTX1RBQkxFOiBhc3NpZ25tZW50c1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgRVNTQVlfUFJPQ0VTU0lOR19RVUVVRV9VUkw6IHByb2Nlc3NpbmdRdWV1ZS5xdWV1ZVVybCxcbiAgICAgICAgQ09HTklUT19VU0VSX1BPT0xfSUQ6IHVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICAgIENPR05JVE9fVVNFUl9QT09MX0NMSUVOVF9JRDogdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgICAgQ09HTklUT19SRUdJT046IHRoaXMucmVnaW9uLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFMzIFVwbG9hZCBUcmlnZ2VyIExhbWJkYSByZW1vdmVkXG4gICAgLy8gQWxsIHVwbG9hZHMgbm93IGhhbmRsZWQgdmlhIEFQSSBMYW1iZGEgL2Vzc2F5cy9iYXRjaCBlbmRwb2ludFxuXG4gICAgLy8gQVBJIEdhdGV3YXlcbiAgICBjb25zdCBhcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsICdWb2NhYkFwaScsIHtcbiAgICAgIHJlc3RBcGlOYW1lOiAndmluY2VudC12b2NhYi1lc3NheS1hbmFseXplci1hcGknLFxuICAgICAgZGVzY3JpcHRpb246ICdBUEkgZm9yIHZvY2FidWxhcnkgZXNzYXkgYW5hbHlzaXMnLFxuICAgICAgZGVmYXVsdENvcnNQcmVmbGlnaHRPcHRpb25zOiB7XG4gICAgICAgIGFsbG93T3JpZ2luczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9PUklHSU5TLFxuICAgICAgICBhbGxvd01ldGhvZHM6IGFwaWdhdGV3YXkuQ29ycy5BTExfTUVUSE9EUyxcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBbJ0NvbnRlbnQtVHlwZScsICdYLUFtei1EYXRlJywgJ0F1dGhvcml6YXRpb24nLCAnWC1BcGktS2V5J10sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ29nbml0byBBdXRob3JpemVyIGZvciBBUEkgR2F0ZXdheVxuICAgIGNvbnN0IGNvZ25pdG9BdXRob3JpemVyID0gbmV3IGFwaWdhdGV3YXkuQ29nbml0b1VzZXJQb29sc0F1dGhvcml6ZXIodGhpcywgJ0NvZ25pdG9BdXRob3JpemVyJywge1xuICAgICAgY29nbml0b1VzZXJQb29sczogW3VzZXJQb29sXSxcbiAgICAgIGF1dGhvcml6ZXJOYW1lOiAndmluY2VudC12b2NhYi1jb2duaXRvLWF1dGhvcml6ZXInLFxuICAgICAgaWRlbnRpdHlTb3VyY2U6ICdtZXRob2QucmVxdWVzdC5oZWFkZXIuQXV0aG9yaXphdGlvbicsXG4gICAgfSk7XG5cbiAgICAvLyBBUEkgR2F0ZXdheSBJbnRlZ3JhdGlvblxuICAgIGNvbnN0IGFwaUludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oYXBpTGFtYmRhKTtcblxuICAgIC8vIEhlYWx0aCBjaGVjayBlbmRwb2ludCAocHVibGljLCBubyBhdXRoIHJlcXVpcmVkKVxuICAgIGNvbnN0IGhlYWx0aFJlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2hlYWx0aCcpO1xuICAgIGhlYWx0aFJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgYXBpSW50ZWdyYXRpb24pO1xuXG4gICAgLy8gQXV0aCBlbmRwb2ludCAocHVibGljLCBubyBhdXRoIHJlcXVpcmVkIGZvciAvYXV0aC9oZWFsdGgpXG4gICAgY29uc3QgYXV0aFJlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2F1dGgnKTtcbiAgICBjb25zdCBhdXRoSGVhbHRoUmVzb3VyY2UgPSBhdXRoUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2hlYWx0aCcpO1xuICAgIGF1dGhIZWFsdGhSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIGFwaUludGVncmF0aW9uKTtcblxuICAgIC8vIFByb3RlY3RlZCBlbmRwb2ludHMgKHJlcXVpcmUgQ29nbml0byBhdXRoZW50aWNhdGlvbilcbiAgICBjb25zdCBhdXRob3JpemVyT3B0aW9ucyA9IHtcbiAgICAgIGF1dGhvcml6ZXI6IGNvZ25pdG9BdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9O1xuXG4gICAgLy8gTGVnYWN5IC9lc3NheSBlbmRwb2ludHMgcmVtb3ZlZCAtIHVzZSAvZXNzYXlzL2JhdGNoIGFuZCAvZXNzYXlzL3tlc3NheV9pZH0gaW5zdGVhZFxuXG4gICAgLy8gU3R1ZGVudHMgZW5kcG9pbnRzIChwcm90ZWN0ZWQpIC0gRXBpYyA3XG4gICAgY29uc3Qgc3R1ZGVudHNSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdzdHVkZW50cycpO1xuICAgIHN0dWRlbnRzUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgYXBpSW50ZWdyYXRpb24sIGF1dGhvcml6ZXJPcHRpb25zKTsgLy8gQ3JlYXRlIHN0dWRlbnRcbiAgICBzdHVkZW50c1Jlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgYXBpSW50ZWdyYXRpb24sIGF1dGhvcml6ZXJPcHRpb25zKTsgLy8gTGlzdCBzdHVkZW50c1xuICAgIGNvbnN0IHN0dWRlbnRJZFJlc291cmNlID0gc3R1ZGVudHNSZXNvdXJjZS5hZGRSZXNvdXJjZSgne3N0dWRlbnRfaWR9Jyk7XG4gICAgc3R1ZGVudElkUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBhcGlJbnRlZ3JhdGlvbiwgYXV0aG9yaXplck9wdGlvbnMpOyAvLyBHZXQgc3R1ZGVudFxuICAgIHN0dWRlbnRJZFJlc291cmNlLmFkZE1ldGhvZCgnUEFUQ0gnLCBhcGlJbnRlZ3JhdGlvbiwgYXV0aG9yaXplck9wdGlvbnMpOyAvLyBVcGRhdGUgc3R1ZGVudFxuICAgIHN0dWRlbnRJZFJlc291cmNlLmFkZE1ldGhvZCgnREVMRVRFJywgYXBpSW50ZWdyYXRpb24sIGF1dGhvcml6ZXJPcHRpb25zKTsgLy8gRGVsZXRlIHN0dWRlbnRcblxuICAgIC8vIEFzc2lnbm1lbnRzIGVuZHBvaW50cyAocHJvdGVjdGVkKSAtIEVwaWMgN1xuICAgIGNvbnN0IGFzc2lnbm1lbnRzUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnYXNzaWdubWVudHMnKTtcbiAgICBhc3NpZ25tZW50c1Jlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIGFwaUludGVncmF0aW9uLCBhdXRob3JpemVyT3B0aW9ucyk7IC8vIENyZWF0ZSBhc3NpZ25tZW50XG4gICAgYXNzaWdubWVudHNSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIGFwaUludGVncmF0aW9uLCBhdXRob3JpemVyT3B0aW9ucyk7IC8vIExpc3QgYXNzaWdubWVudHNcbiAgICBjb25zdCBhc3NpZ25tZW50SWRSZXNvdXJjZSA9IGFzc2lnbm1lbnRzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3thc3NpZ25tZW50X2lkfScpO1xuICAgIGFzc2lnbm1lbnRJZFJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgYXBpSW50ZWdyYXRpb24sIGF1dGhvcml6ZXJPcHRpb25zKTsgLy8gR2V0IGFzc2lnbm1lbnRcbiAgICBjb25zdCBhc3NpZ25tZW50VXBsb2FkUmVzb3VyY2UgPSBhc3NpZ25tZW50SWRSZXNvdXJjZS5hZGRSZXNvdXJjZSgndXBsb2FkLXVybCcpO1xuICAgIGFzc2lnbm1lbnRVcGxvYWRSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBhcGlJbnRlZ3JhdGlvbiwgYXV0aG9yaXplck9wdGlvbnMpOyAvLyBHZXQgcHJlc2lnbmVkIHVwbG9hZCBVUkxcblxuICAgIC8vIE1ldHJpY3MgZW5kcG9pbnRzIChwcm90ZWN0ZWQpIC0gRXBpYyA4XG4gICAgY29uc3QgbWV0cmljc1Jlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ21ldHJpY3MnKTtcbiAgICBjb25zdCBtZXRyaWNzQ2xhc3NSZXNvdXJjZSA9IG1ldHJpY3NSZXNvdXJjZS5hZGRSZXNvdXJjZSgnY2xhc3MnKTtcbiAgICBjb25zdCBtZXRyaWNzQ2xhc3NJZFJlc291cmNlID0gbWV0cmljc0NsYXNzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3thc3NpZ25tZW50X2lkfScpO1xuICAgIG1ldHJpY3NDbGFzc0lkUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBhcGlJbnRlZ3JhdGlvbiwgYXV0aG9yaXplck9wdGlvbnMpOyAvLyBHZXQgY2xhc3MgbWV0cmljc1xuICAgIGNvbnN0IG1ldHJpY3NTdHVkZW50UmVzb3VyY2UgPSBtZXRyaWNzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3N0dWRlbnQnKTtcbiAgICBjb25zdCBtZXRyaWNzU3R1ZGVudElkUmVzb3VyY2UgPSBtZXRyaWNzU3R1ZGVudFJlc291cmNlLmFkZFJlc291cmNlKCd7c3R1ZGVudF9pZH0nKTtcbiAgICBtZXRyaWNzU3R1ZGVudElkUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBhcGlJbnRlZ3JhdGlvbiwgYXV0aG9yaXplck9wdGlvbnMpOyAvLyBHZXQgc3R1ZGVudCBtZXRyaWNzXG5cbiAgICAvLyBFc3NheXMgZW5kcG9pbnRzIChwcm90ZWN0ZWQpXG4gICAgY29uc3QgZXNzYXlzUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnZXNzYXlzJyk7XG4gICAgY29uc3QgZXNzYXlzQmF0Y2hSZXNvdXJjZSA9IGVzc2F5c1Jlc291cmNlLmFkZFJlc291cmNlKCdiYXRjaCcpO1xuICAgIGVzc2F5c0JhdGNoUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgYXBpSW50ZWdyYXRpb24sIGF1dGhvcml6ZXJPcHRpb25zKTsgLy8gUE9TVCAvZXNzYXlzL2JhdGNoIC0gYmF0Y2ggdXBsb2FkXG4gICAgY29uc3QgZXNzYXlJZFJlc291cmNlT3ZlcnJpZGUgPSBlc3NheXNSZXNvdXJjZS5hZGRSZXNvdXJjZSgne2Vzc2F5X2lkfScpO1xuICAgIGVzc2F5SWRSZXNvdXJjZU92ZXJyaWRlLmFkZE1ldGhvZCgnR0VUJywgYXBpSW50ZWdyYXRpb24sIGF1dGhvcml6ZXJPcHRpb25zKTsgLy8gR0VUIC9lc3NheXMve2Vzc2F5X2lkfSAtIGdldCBlc3NheVxuICAgIGNvbnN0IGVzc2F5T3ZlcnJpZGVSZXNvdXJjZSA9IGVzc2F5SWRSZXNvdXJjZU92ZXJyaWRlLmFkZFJlc291cmNlKCdvdmVycmlkZScpO1xuICAgIGVzc2F5T3ZlcnJpZGVSZXNvdXJjZS5hZGRNZXRob2QoJ1BBVENIJywgYXBpSW50ZWdyYXRpb24sIGF1dGhvcml6ZXJPcHRpb25zKTsgLy8gT3ZlcnJpZGUgZXNzYXkgZmVlZGJhY2tcbiAgICBjb25zdCBlc3NheXNTdHVkZW50UmVzb3VyY2UgPSBlc3NheXNSZXNvdXJjZS5hZGRSZXNvdXJjZSgnc3R1ZGVudCcpO1xuICAgIGNvbnN0IGVzc2F5c1N0dWRlbnRJZFJlc291cmNlID0gZXNzYXlzU3R1ZGVudFJlc291cmNlLmFkZFJlc291cmNlKCd7c3R1ZGVudF9pZH0nKTtcbiAgICBlc3NheXNTdHVkZW50SWRSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIGFwaUludGVncmF0aW9uLCBhdXRob3JpemVyT3B0aW9ucyk7IC8vIExpc3QgZXNzYXlzIGZvciBzdHVkZW50XG5cbiAgICAvLyBFQ1MsIEFnZ3JlZ2F0aW9uIExhbWJkYXMsIGFuZCBFc3NheVVwZGF0ZVF1ZXVlIHJlbW92ZWRcbiAgICAvLyBBbGwgcHJvY2Vzc2luZyBub3cgaGFuZGxlZCBieSBXb3JrZXIgTGFtYmRhIHZpYSBFc3NheVByb2Nlc3NpbmdRdWV1ZVxuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBXb3JrZXIgTGFtYmRhIChTUVMtdHJpZ2dlcmVkIGVzc2F5IHByb2Nlc3NvcilcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gSUFNIFJvbGUgZm9yIFdvcmtlciBMYW1iZGFcbiAgICBjb25zdCB3b3JrZXJMYW1iZGFSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdXb3JrZXJMYW1iZGFSb2xlJywge1xuICAgICAgcm9sZU5hbWU6ICd2aW5jZW50LXZvY2FiLXdvcmtlci1sYW1iZGEtcm9sZScsXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnSUFNIHJvbGUgZm9yIFdvcmtlciBMYW1iZGEgZnVuY3Rpb24nLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZScpLFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IHBlcm1pc3Npb25zIGZvciBXb3JrZXIgTGFtYmRhXG4gICAgZXNzYXlzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHdvcmtlckxhbWJkYVJvbGUpO1xuICAgIHByb2Nlc3NpbmdRdWV1ZS5ncmFudENvbnN1bWVNZXNzYWdlcyh3b3JrZXJMYW1iZGFSb2xlKTtcblxuICAgIC8vIFdvcmtlciBMYW1iZGEgRnVuY3Rpb25cbiAgICBjb25zdCB3b3JrZXJMYW1iZGFDb2RlID0gcHJvY2Vzcy5lbnYuQ0RLX1NLSVBfQlVORExJTkcgPT09ICd0cnVlJ1xuICAgICAgPyBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYS93b3JrZXInKSlcbiAgICAgIDogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGEvd29ya2VyJyksIHtcbiAgICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgICAgaW1hZ2U6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzEyLmJ1bmRsaW5nSW1hZ2UsXG4gICAgICAgICAgICBjb21tYW5kOiBbXG4gICAgICAgICAgICAgICdiYXNoJywgJy1jJyxcbiAgICAgICAgICAgICAgJ3BpcCBpbnN0YWxsIC1yIHJlcXVpcmVtZW50cy50eHQgLXQgL2Fzc2V0LW91dHB1dCAmJiAnICtcbiAgICAgICAgICAgICAgJ2NwIC1yIGxhbWJkYV9mdW5jdGlvbi5weSAvYXNzZXQtb3V0cHV0IDI+L2Rldi9udWxsIHx8IHRydWUnLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGV4Y2x1ZGU6IFsnX19weWNhY2hlX18nLCAnKi5weWMnLCAnKi5weW8nXSxcbiAgICAgICAgfSk7XG5cbiAgICBjb25zdCB3b3JrZXJMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdXb3JrZXJMYW1iZGEnLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6ICd2aW5jZW50LXZvY2FiLXdvcmtlci1sYW1iZGEnLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTIsXG4gICAgICBoYW5kbGVyOiAnbGFtYmRhX2Z1bmN0aW9uLmhhbmRsZXInLFxuICAgICAgY29kZTogd29ya2VyTGFtYmRhQ29kZSxcbiAgICAgIHJvbGU6IHdvcmtlckxhbWJkYVJvbGUsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSwgLy8gTXVzdCBiZSA+PSBTUVMgdmlzaWJpbGl0eSB0aW1lb3V0XG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBFU1NBWVNfVEFCTEU6IGVzc2F5c1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgT1BFTkFJX0FQSV9LRVk6IHByb2Nlc3MuZW52Lk9QRU5BSV9BUElfS0VZIHx8ICcnLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFNRUyBFdmVudCBTb3VyY2UgZm9yIFdvcmtlciBMYW1iZGFcbiAgICB3b3JrZXJMYW1iZGEuYWRkRXZlbnRTb3VyY2UoXG4gICAgICBuZXcgbGFtYmRhRXZlbnRTb3VyY2VzLlNxc0V2ZW50U291cmNlKHByb2Nlc3NpbmdRdWV1ZSwge1xuICAgICAgICBiYXRjaFNpemU6IDEwLCAvLyBQcm9jZXNzIHVwIHRvIDEwIG1lc3NhZ2VzIGF0IGEgdGltZVxuICAgICAgICBtYXhCYXRjaGluZ1dpbmRvdzogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBDbG91ZFdhdGNoIE9ic2VydmFiaWxpdHkgKEVwaWMgNSlcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gU05TIFRvcGljIGZvciBhbGFybSBub3RpZmljYXRpb25zIChvcHRpb25hbCAtIGNhbiBiZSBjb25maWd1cmVkIGxhdGVyKVxuICAgIGNvbnN0IGFsYXJtVG9waWMgPSBuZXcgc25zLlRvcGljKHRoaXMsICdBbGFybVRvcGljJywge1xuICAgICAgZGlzcGxheU5hbWU6ICd2aW5jZW50LXZvY2FiLWVzc2F5LWFuYWx5emVyLWFsYXJtcycsXG4gICAgfSk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIEFsYXJtOiBBUEkgTGFtYmRhIEVycm9yc1xuICAgIGNvbnN0IGFwaUxhbWJkYUVycm9yQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnQXBpTGFtYmRhRXJyb3JBbGFybScsIHtcbiAgICAgIGFsYXJtTmFtZTogJ3ZpbmNlbnQtdm9jYWItYXBpLWxhbWJkYS1lcnJvcnMnLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ0FsZXJ0cyB3aGVuIEFQSSBMYW1iZGEgZXJyb3JzIGV4Y2VlZCB0aHJlc2hvbGQnLFxuICAgICAgbWV0cmljOiBhcGlMYW1iZGEubWV0cmljRXJyb3JzKHtcbiAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiA1LCAvLyBBbGVydCBpZiA1KyBlcnJvcnMgaW4gNSBtaW51dGVzXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuICAgIGFwaUxhbWJkYUVycm9yQWxhcm0uYWRkQWxhcm1BY3Rpb24obmV3IGNsb3Vkd2F0Y2hBY3Rpb25zLlNuc0FjdGlvbihhbGFybVRvcGljKSk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIEFsYXJtOiBXb3JrZXIgTGFtYmRhIEVycm9yc1xuICAgIGNvbnN0IHdvcmtlckxhbWJkYUVycm9yQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnV29ya2VyTGFtYmRhRXJyb3JBbGFybScsIHtcbiAgICAgIGFsYXJtTmFtZTogJ3ZpbmNlbnQtdm9jYWItd29ya2VyLWxhbWJkYS1lcnJvcnMnLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ0FsZXJ0cyB3aGVuIFdvcmtlciBMYW1iZGEgZXJyb3JzIGV4Y2VlZCB0aHJlc2hvbGQnLFxuICAgICAgbWV0cmljOiB3b3JrZXJMYW1iZGEubWV0cmljRXJyb3JzKHtcbiAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiA1LCAvLyBBbGVydCBpZiA1KyBlcnJvcnMgaW4gNSBtaW51dGVzXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuICAgIHdvcmtlckxhbWJkYUVycm9yQWxhcm0uYWRkQWxhcm1BY3Rpb24obmV3IGNsb3Vkd2F0Y2hBY3Rpb25zLlNuc0FjdGlvbihhbGFybVRvcGljKSk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIEFsYXJtOiBTUVMgUXVldWUgRGVwdGhcbiAgICBjb25zdCBzcXNRdWV1ZURlcHRoQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnU3FzUXVldWVEZXB0aEFsYXJtJywge1xuICAgICAgYWxhcm1OYW1lOiAndmluY2VudC12b2NhYi1wcm9jZXNzaW5nLXF1ZXVlLWRlcHRoJyxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246ICdBbGVydHMgd2hlbiBwcm9jZXNzaW5nIHF1ZXVlIGhhcyBtb3JlIHRoYW4gMTAgbWVzc2FnZXMnLFxuICAgICAgbWV0cmljOiBwcm9jZXNzaW5nUXVldWUubWV0cmljQXBwcm94aW1hdGVOdW1iZXJPZk1lc3NhZ2VzVmlzaWJsZSh7XG4gICAgICAgIHN0YXRpc3RpYzogJ0F2ZXJhZ2UnLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDEwLFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcbiAgICBzcXNRdWV1ZURlcHRoQWxhcm0uYWRkQWxhcm1BY3Rpb24obmV3IGNsb3Vkd2F0Y2hBY3Rpb25zLlNuc0FjdGlvbihhbGFybVRvcGljKSk7XG5cbiAgICAvLyBFQ1MtcmVsYXRlZCBhbGFybXMgcmVtb3ZlZFxuXG4gICAgLy8gQ2xvdWRXYXRjaCBBbGFybTogRGVhZCBMZXR0ZXIgUXVldWUgTWVzc2FnZXMgKEZhaWxlZCBQcm9jZXNzaW5nKVxuICAgIGNvbnN0IGRscUFsYXJtID0gbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgJ0RMUUFsYXJtJywge1xuICAgICAgYWxhcm1OYW1lOiAndmluY2VudC12b2NhYi1kbHEtbWVzc2FnZXMnLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ0FsZXJ0cyB3aGVuIG1lc3NhZ2VzIGFyZSBzZW50IHRvIERMUSAocHJvY2Vzc2luZyBmYWlsdXJlcyknLFxuICAgICAgbWV0cmljOiBkbHEubWV0cmljQXBwcm94aW1hdGVOdW1iZXJPZk1lc3NhZ2VzVmlzaWJsZSh7XG4gICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogMSwgLy8gQWxlcnQgaWYgYW55IG1lc3NhZ2UgaW4gRExRXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuICAgIGRscUFsYXJtLmFkZEFsYXJtQWN0aW9uKG5ldyBjbG91ZHdhdGNoQWN0aW9ucy5TbnNBY3Rpb24oYWxhcm1Ub3BpYykpO1xuXG4gICAgLy8gQ2xvdWRGb3JtYXRpb24gT3V0cHV0c1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdFc3NheXNCdWNrZXROYW1lJywge1xuICAgICAgdmFsdWU6IGVzc2F5c0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdTMyBidWNrZXQgbmFtZSBmb3IgZXNzYXkgc3RvcmFnZScsXG4gICAgICBleHBvcnROYW1lOiAnRXNzYXlzQnVja2V0TmFtZScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUHJvY2Vzc2luZ1F1ZXVlVXJsJywge1xuICAgICAgdmFsdWU6IHByb2Nlc3NpbmdRdWV1ZS5xdWV1ZVVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU1FTIHF1ZXVlIFVSTCBmb3IgZXNzYXkgcHJvY2Vzc2luZycsXG4gICAgICBleHBvcnROYW1lOiAnUHJvY2Vzc2luZ1F1ZXVlVXJsJyxcbiAgICB9KTtcblxuICAgIC8vIExlZ2FjeSBNZXRyaWNzVGFibGVOYW1lIG91dHB1dCByZW1vdmVkIC0gdXNlIEVzc2F5c1RhYmxlTmFtZSBpbnN0ZWFkXG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRXNzYXlzVGFibGVOYW1lJywge1xuICAgICAgdmFsdWU6IGVzc2F5c1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRHluYW1vREIgdGFibGUgbmFtZSBmb3IgZXNzYXlzJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdFc3NheXNUYWJsZU5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1RlYWNoZXJzVGFibGVOYW1lJywge1xuICAgICAgdmFsdWU6IHRlYWNoZXJzVGFibGUudGFibGVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdEeW5hbW9EQiB0YWJsZSBuYW1lIGZvciB0ZWFjaGVycycsXG4gICAgICBleHBvcnROYW1lOiAnVGVhY2hlcnNUYWJsZU5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1N0dWRlbnRzVGFibGVOYW1lJywge1xuICAgICAgdmFsdWU6IHN0dWRlbnRzVGFibGUudGFibGVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdEeW5hbW9EQiB0YWJsZSBuYW1lIGZvciBzdHVkZW50cycsXG4gICAgICBleHBvcnROYW1lOiAnU3R1ZGVudHNUYWJsZU5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Fzc2lnbm1lbnRzVGFibGVOYW1lJywge1xuICAgICAgdmFsdWU6IGFzc2lnbm1lbnRzVGFibGUudGFibGVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdEeW5hbW9EQiB0YWJsZSBuYW1lIGZvciBhc3NpZ25tZW50cycsXG4gICAgICBleHBvcnROYW1lOiAnQXNzaWdubWVudHNUYWJsZU5hbWUnLFxuICAgIH0pO1xuXG4gICAgLy8gTGVnYWN5IENsYXNzTWV0cmljc1RhYmxlTmFtZSBhbmQgU3R1ZGVudE1ldHJpY3NUYWJsZU5hbWUgb3V0cHV0cyByZW1vdmVkXG4gICAgLy8gTWV0cmljcyBhcmUgbm93IGNvbXB1dGVkIG9uLWRlbWFuZCBmcm9tIEVzc2F5cyB0YWJsZVxuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaUxhbWJkYVJvbGVBcm4nLCB7XG4gICAgICB2YWx1ZTogYXBpTGFtYmRhUm9sZS5yb2xlQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdJQU0gcm9sZSBBUk4gZm9yIEFQSSBMYW1iZGEnLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwaUxhbWJkYVJvbGVBcm4nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1dvcmtlckxhbWJkYVJvbGVBcm4nLCB7XG4gICAgICB2YWx1ZTogd29ya2VyTGFtYmRhUm9sZS5yb2xlQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdJQU0gcm9sZSBBUk4gZm9yIFdvcmtlciBMYW1iZGEnLFxuICAgICAgZXhwb3J0TmFtZTogJ1dvcmtlckxhbWJkYVJvbGVBcm4nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaVVybCcsIHtcbiAgICAgIHZhbHVlOiBhcGkudXJsLFxuICAgICAgZGVzY3JpcHRpb246ICdBUEkgR2F0ZXdheSBlbmRwb2ludCBVUkwnLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwaVVybCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRXNzYXlzVGFibGVOYW1lJywge1xuICAgICAgdmFsdWU6IGVzc2F5c1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRHluYW1vREIgdGFibGUgbmFtZSBmb3IgZXNzYXlzJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdFc3NheXNUYWJsZU5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1dvcmtlckxhbWJkYUZ1bmN0aW9uTmFtZScsIHtcbiAgICAgIHZhbHVlOiB3b3JrZXJMYW1iZGEuZnVuY3Rpb25OYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdXb3JrZXIgTGFtYmRhIGZ1bmN0aW9uIG5hbWUnLFxuICAgICAgZXhwb3J0TmFtZTogJ1dvcmtlckxhbWJkYUZ1bmN0aW9uTmFtZScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQWxhcm1Ub3BpY0FybicsIHtcbiAgICAgIHZhbHVlOiBhbGFybVRvcGljLnRvcGljQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdTTlMgdG9waWMgQVJOIGZvciBDbG91ZFdhdGNoIGFsYXJtIG5vdGlmaWNhdGlvbnMnLFxuICAgICAgZXhwb3J0TmFtZTogJ0FsYXJtVG9waWNBcm4nLFxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBDb2duaXRvIE91dHB1dHMgKEVwaWMgNilcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0NvZ25pdG9Vc2VyUG9vbElkJywge1xuICAgICAgdmFsdWU6IHVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIElEIGZvciB0ZWFjaGVyIGF1dGhlbnRpY2F0aW9uJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdDb2duaXRvVXNlclBvb2xJZCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ29nbml0b1VzZXJQb29sQ2xpZW50SWQnLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgQ2xpZW50IElEIGZvciBmcm9udGVuZCcsXG4gICAgICBleHBvcnROYW1lOiAnQ29nbml0b1VzZXJQb29sQ2xpZW50SWQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0NvZ25pdG9SZWdpb24nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5yZWdpb24sXG4gICAgICBkZXNjcmlwdGlvbjogJ0FXUyByZWdpb24gZm9yIENvZ25pdG8nLFxuICAgICAgZXhwb3J0TmFtZTogJ0NvZ25pdG9SZWdpb24nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0NvZ25pdG9Ib3N0ZWRVaVVybCcsIHtcbiAgICAgIHZhbHVlOiBgaHR0cHM6Ly8ke3VzZXJQb29sRG9tYWluLmRvbWFpbk5hbWV9LmF1dGguJHt0aGlzLnJlZ2lvbn0uYW1hem9uY29nbml0by5jb21gLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIEhvc3RlZCBVSSBVUkwnLFxuICAgICAgZXhwb3J0TmFtZTogJ0NvZ25pdG9Ib3N0ZWRVaVVybCcsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==
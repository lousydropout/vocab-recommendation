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
        processorLambdaRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['bedrock:InvokeModel'],
            resources: [
                `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-sonnet-*`,
                `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-haiku-*`,
                `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-opus-*`,
            ],
        }));
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
        essaysBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(s3UploadLambda), { prefix: 'essays/' });
        // ============================================
        // Cognito User Pool (Epic 6)
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
                // AWS_REGION is automatically set by Lambda runtime
            },
        });
        // SQS Event Source for Processor Lambda
        processorLambda.addEventSource(new lambdaEventSources.SqsEventSource(processingQueue, {
            batchSize: 1, // Process one essay at a time
            maxBatchingWindow: cdk.Duration.seconds(0),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidm9jYWJfcmVjb21tZW5kYXRpb24tc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2b2NhYl9yZWNvbW1lbmRhdGlvbi1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUVuQyx1REFBeUM7QUFDekMsbUVBQXFEO0FBQ3JELHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MsK0RBQWlEO0FBQ2pELHVFQUF5RDtBQUN6RCxzRUFBd0Q7QUFDeEQseUZBQTJFO0FBQzNFLHVFQUF5RDtBQUN6RCxzRkFBd0U7QUFDeEUseURBQTJDO0FBQzNDLGlFQUFtRDtBQUNuRCwyQ0FBNkI7QUFFN0IsTUFBYSx3QkFBeUIsU0FBUSxHQUFHLENBQUMsS0FBSztJQUNyRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLDhCQUE4QjtRQUM5QixNQUFNLFlBQVksR0FBRyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtZQUN2RCxVQUFVLEVBQUUsd0JBQXdCLElBQUksQ0FBQyxPQUFPLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRTtZQUNqRSxhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsbUNBQW1DO1lBQzdFLGlCQUFpQixFQUFFLElBQUksRUFBRSxxREFBcUQ7WUFDOUUsU0FBUyxFQUFFLEtBQUs7WUFDaEIsVUFBVSxFQUFFLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVO1lBQzFDLGlCQUFpQixFQUFFLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTO1lBQ2pELElBQUksRUFBRTtnQkFDSjtvQkFDRSxjQUFjLEVBQUUsQ0FBQyxHQUFHLENBQUM7b0JBQ3JCLGNBQWMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxXQUFXLENB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SUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUMzQyxLQUFLLEVBQUUsUUFBUSxDQUFDLFVBQVU7WUFDMUIsV0FBVyxFQUFFLGlEQUFpRDtZQUM5RCxVQUFVLEVBQUUsbUJBQW1CO1NBQ2hDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUseUJBQXlCLEVBQUU7WUFDakQsS0FBSyxFQUFFLGNBQWMsQ0FBQyxnQkFBZ0I7WUFDdEMsV0FBVyxFQUFFLDBDQUEwQztZQUN2RCxVQUFVLEVBQUUseUJBQXlCO1NBQ3RDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQ3ZDLEtBQUssRUFBRSxJQUFJLENBQUMsTUFBTTtZQUNsQixXQUFXLEVBQUUsd0JBQXdCO1lBQ3JDLFVBQVUsRUFBRSxlQUFlO1NBQzVCLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsb0JBQW9CLEVBQUU7WUFDNUMsS0FBSyxFQUFFLFdBQVcsY0FBYyxDQUFDLFVBQVUsU0FBUyxJQUFJLENBQUMsTUFBTSxvQkFBb0I7WUFDbkYsV0FBVyxFQUFFLHVCQUF1QjtZQUNwQyxVQUFVLEVBQUUsb0JBQW9CO1NBQ2pDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQTdkRCw0REE2ZEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcbmltcG9ydCAqIGFzIHNxcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3FzJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgczNuIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMy1ub3RpZmljYXRpb25zJztcbmltcG9ydCAqIGFzIGxhbWJkYUV2ZW50U291cmNlcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhLWV2ZW50LXNvdXJjZXMnO1xuaW1wb3J0ICogYXMgY2xvdWR3YXRjaCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaCc7XG5pbXBvcnQgKiBhcyBjbG91ZHdhdGNoQWN0aW9ucyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaC1hY3Rpb25zJztcbmltcG9ydCAqIGFzIHNucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zJztcbmltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZ25pdG8nO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuZXhwb3J0IGNsYXNzIFZvY2FiUmVjb21tZW5kYXRpb25TdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIC8vIFMzIEJ1Y2tldCBmb3IgZXNzYXkgdXBsb2Fkc1xuICAgIGNvbnN0IGVzc2F5c0J1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0Vzc2F5c0J1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGB2aW5jZW50LXZvY2FiLWVzc2F5cy0ke3RoaXMuYWNjb3VudH0tJHt0aGlzLnJlZ2lvbn1gLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSwgLy8gRm9yIFBvQyAtIGFsbG93cyBidWNrZXQgZGVsZXRpb25cbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLCAvLyBBdXRvbWF0aWNhbGx5IGRlbGV0ZSBvYmplY3RzIHdoZW4gc3RhY2sgaXMgZGVsZXRlZFxuICAgICAgdmVyc2lvbmVkOiBmYWxzZSxcbiAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICBjb3JzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhbGxvd2VkT3JpZ2luczogWycqJ10sXG4gICAgICAgICAgYWxsb3dlZE1ldGhvZHM6IFtzMy5IdHRwTWV0aG9kcy5HRVQsIHMzLkh0dHBNZXRob2RzLlBVVCwgczMuSHR0cE1ldGhvZHMuUE9TVF0sXG4gICAgICAgICAgYWxsb3dlZEhlYWRlcnM6IFsnKiddLFxuICAgICAgICAgIG1heEFnZTogMzYwMCxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBTUVMgRGVhZCBMZXR0ZXIgUXVldWVcbiAgICBjb25zdCBkbHEgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsICdQcm9jZXNzaW5nRExRJywge1xuICAgICAgcXVldWVOYW1lOiAndmluY2VudC12b2NhYi1lc3NheS1wcm9jZXNzaW5nLWRscScsXG4gICAgICByZXRlbnRpb25QZXJpb2Q6IGNkay5EdXJhdGlvbi5kYXlzKDE0KSxcbiAgICAgIGVuY3J5cHRpb246IHNxcy5RdWV1ZUVuY3J5cHRpb24uU1FTX01BTkFHRUQsXG4gICAgfSk7XG5cbiAgICAvLyBTUVMgUXVldWUgZm9yIGVzc2F5IHByb2Nlc3NpbmdcbiAgICBjb25zdCBwcm9jZXNzaW5nUXVldWUgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsICdFc3NheVByb2Nlc3NpbmdRdWV1ZScsIHtcbiAgICAgIHF1ZXVlTmFtZTogJ3ZpbmNlbnQtdm9jYWItZXNzYXktcHJvY2Vzc2luZy1xdWV1ZScsXG4gICAgICB2aXNpYmlsaXR5VGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksIC8vIE11c3QgYmUgPj0gTGFtYmRhIHRpbWVvdXRcbiAgICAgIHJldGVudGlvblBlcmlvZDogY2RrLkR1cmF0aW9uLmRheXMoMTQpLFxuICAgICAgZW5jcnlwdGlvbjogc3FzLlF1ZXVlRW5jcnlwdGlvbi5TUVNfTUFOQUdFRCxcbiAgICAgIGRlYWRMZXR0ZXJRdWV1ZToge1xuICAgICAgICBxdWV1ZTogZGxxLFxuICAgICAgICBtYXhSZWNlaXZlQ291bnQ6IDMsIC8vIFJldHJ5IDMgdGltZXMgYmVmb3JlIHNlbmRpbmcgdG8gRExRXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gRHluYW1vREIgVGFibGUgZm9yIGVzc2F5IG1ldHJpY3NcbiAgICBjb25zdCBtZXRyaWNzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ0Vzc2F5TWV0cmljcycsIHtcbiAgICAgIHRhYmxlTmFtZTogJ1ZpbmNlbnRWb2NhYkVzc2F5TWV0cmljcycsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ2Vzc2F5X2lkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsIC8vIE9uLWRlbWFuZCBwcmljaW5nIGZvciBQb0NcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksIC8vIEZvciBQb0MgLSBhbGxvd3MgdGFibGUgZGVsZXRpb25cbiAgICAgIHBvaW50SW5UaW1lUmVjb3ZlcnlTcGVjaWZpY2F0aW9uOiB7XG4gICAgICAgIHBvaW50SW5UaW1lUmVjb3ZlcnlFbmFibGVkOiBmYWxzZSwgLy8gQ2FuIGVuYWJsZSBmb3IgcHJvZHVjdGlvblxuICAgICAgfSxcbiAgICAgIGVuY3J5cHRpb246IGR5bmFtb2RiLlRhYmxlRW5jcnlwdGlvbi5BV1NfTUFOQUdFRCxcbiAgICB9KTtcblxuICAgIC8vIElBTSBSb2xlIGZvciBBUEkgTGFtYmRhICh3aWxsIGJlIHVzZWQgaW4gRXBpYyAyKVxuICAgIGNvbnN0IGFwaUxhbWJkYVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0FwaUxhbWJkYVJvbGUnLCB7XG4gICAgICByb2xlTmFtZTogJ3ZpbmNlbnQtdm9jYWItYXBpLWxhbWJkYS1yb2xlJyxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgZGVzY3JpcHRpb246ICdJQU0gcm9sZSBmb3IgQVBJIExhbWJkYSBmdW5jdGlvbicsXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJyksXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgcGVybWlzc2lvbnMgZm9yIEFQSSBMYW1iZGFcbiAgICBlc3NheXNCdWNrZXQuZ3JhbnRSZWFkV3JpdGUoYXBpTGFtYmRhUm9sZSk7XG4gICAgbWV0cmljc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShhcGlMYW1iZGFSb2xlKTtcbiAgICBwcm9jZXNzaW5nUXVldWUuZ3JhbnRTZW5kTWVzc2FnZXMoYXBpTGFtYmRhUm9sZSk7XG5cbiAgICAvLyBJQU0gUm9sZSBmb3IgUzMgVXBsb2FkIExhbWJkYSAod2lsbCBiZSB1c2VkIGluIEVwaWMgMilcbiAgICAvLyBUaGlzIExhbWJkYSB3aWxsIGJlIHRyaWdnZXJlZCBieSBTMyBldmVudHMgYW5kIHB1c2ggdG8gU1FTXG4gICAgY29uc3QgczNVcGxvYWRMYW1iZGFSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdTM1VwbG9hZExhbWJkYVJvbGUnLCB7XG4gICAgICByb2xlTmFtZTogJ3ZpbmNlbnQtdm9jYWItczMtdXBsb2FkLWxhbWJkYS1yb2xlJyxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgZGVzY3JpcHRpb246ICdJQU0gcm9sZSBmb3IgUzMgdXBsb2FkIHRyaWdnZXIgTGFtYmRhIGZ1bmN0aW9uJyxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnKSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBwZXJtaXNzaW9ucyBmb3IgUzMgVXBsb2FkIExhbWJkYVxuICAgIGVzc2F5c0J1Y2tldC5ncmFudFJlYWQoczNVcGxvYWRMYW1iZGFSb2xlKTtcbiAgICBwcm9jZXNzaW5nUXVldWUuZ3JhbnRTZW5kTWVzc2FnZXMoczNVcGxvYWRMYW1iZGFSb2xlKTtcblxuICAgIC8vIElBTSBSb2xlIGZvciBQcm9jZXNzb3IgTGFtYmRhICh3aWxsIGJlIHVzZWQgaW4gRXBpYyAzKVxuICAgIGNvbnN0IHByb2Nlc3NvckxhbWJkYVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1Byb2Nlc3NvckxhbWJkYVJvbGUnLCB7XG4gICAgICByb2xlTmFtZTogJ3ZpbmNlbnQtdm9jYWItcHJvY2Vzc29yLWxhbWJkYS1yb2xlJyxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgZGVzY3JpcHRpb246ICdJQU0gcm9sZSBmb3IgZXNzYXkgcHJvY2Vzc29yIExhbWJkYSBmdW5jdGlvbicsXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJyksXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgcGVybWlzc2lvbnMgZm9yIFByb2Nlc3NvciBMYW1iZGFcbiAgICBlc3NheXNCdWNrZXQuZ3JhbnRSZWFkKHByb2Nlc3NvckxhbWJkYVJvbGUpO1xuICAgIG1ldHJpY3NUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEocHJvY2Vzc29yTGFtYmRhUm9sZSk7XG4gICAgcHJvY2Vzc2luZ1F1ZXVlLmdyYW50Q29uc3VtZU1lc3NhZ2VzKHByb2Nlc3NvckxhbWJkYVJvbGUpO1xuXG4gICAgLy8gR3JhbnQgQmVkcm9jayBwZXJtaXNzaW9ucyBmb3IgUHJvY2Vzc29yIExhbWJkYVxuICAgIHByb2Nlc3NvckxhbWJkYVJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogWydiZWRyb2NrOkludm9rZU1vZGVsJ10sXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIGBhcm46YXdzOmJlZHJvY2s6JHt0aGlzLnJlZ2lvbn06OmZvdW5kYXRpb24tbW9kZWwvYW50aHJvcGljLmNsYXVkZS0zLXNvbm5ldC0qYCxcbiAgICAgICAgICBgYXJuOmF3czpiZWRyb2NrOiR7dGhpcy5yZWdpb259Ojpmb3VuZGF0aW9uLW1vZGVsL2FudGhyb3BpYy5jbGF1ZGUtMy1oYWlrdS0qYCxcbiAgICAgICAgICBgYXJuOmF3czpiZWRyb2NrOiR7dGhpcy5yZWdpb259Ojpmb3VuZGF0aW9uLW1vZGVsL2FudGhyb3BpYy5jbGF1ZGUtMy1vcHVzLSpgLFxuICAgICAgICBdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gQVBJIExhbWJkYSBGdW5jdGlvblxuICAgIC8vIFNraXAgYnVuZGxpbmcgaW4gdGVzdCBlbnZpcm9ubWVudCAoRG9ja2VyIG5vdCBhdmFpbGFibGUpXG4gICAgY29uc3QgYXBpTGFtYmRhQ29kZSA9IHByb2Nlc3MuZW52LkNES19TS0lQX0JVTkRMSU5HID09PSAndHJ1ZSdcbiAgICAgID8gbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGEvYXBpJykpXG4gICAgICA6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhL2FwaScpLCB7XG4gICAgICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgICAgIGltYWdlOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMi5idW5kbGluZ0ltYWdlLFxuICAgICAgICAgICAgY29tbWFuZDogW1xuICAgICAgICAgICAgICAnYmFzaCcsICctYycsXG4gICAgICAgICAgICAgICdwaXAgaW5zdGFsbCAtciByZXF1aXJlbWVudHMudHh0IC10IC9hc3NldC1vdXRwdXQgJiYgY3AgLWF1IC4gL2Fzc2V0LW91dHB1dCcsXG4gICAgICAgICAgICBdLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuICAgIFxuICAgIGNvbnN0IGFwaUxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0FwaUxhbWJkYScsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ3ZpbmNlbnQtdm9jYWItYXBpLWxhbWJkYScsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMixcbiAgICAgIGhhbmRsZXI6ICdsYW1iZGFfZnVuY3Rpb24uaGFuZGxlcicsXG4gICAgICBjb2RlOiBhcGlMYW1iZGFDb2RlLFxuICAgICAgcm9sZTogYXBpTGFtYmRhUm9sZSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEVTU0FZU19CVUNLRVQ6IGVzc2F5c0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICBNRVRSSUNTX1RBQkxFOiBtZXRyaWNzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBQUk9DRVNTSU5HX1FVRVVFX1VSTDogcHJvY2Vzc2luZ1F1ZXVlLnF1ZXVlVXJsLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFMzIFVwbG9hZCBUcmlnZ2VyIExhbWJkYSBGdW5jdGlvblxuICAgIC8vIFNraXAgYnVuZGxpbmcgaW4gdGVzdCBlbnZpcm9ubWVudCAoRG9ja2VyIG5vdCBhdmFpbGFibGUpXG4gICAgY29uc3QgczNVcGxvYWRMYW1iZGFDb2RlID0gcHJvY2Vzcy5lbnYuQ0RLX1NLSVBfQlVORExJTkcgPT09ICd0cnVlJ1xuICAgICAgPyBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYS9zM191cGxvYWRfdHJpZ2dlcicpKVxuICAgICAgOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYS9zM191cGxvYWRfdHJpZ2dlcicpLCB7XG4gICAgICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgICAgIGltYWdlOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMi5idW5kbGluZ0ltYWdlLFxuICAgICAgICAgICAgY29tbWFuZDogW1xuICAgICAgICAgICAgICAnYmFzaCcsICctYycsXG4gICAgICAgICAgICAgICdwaXAgaW5zdGFsbCAtciByZXF1aXJlbWVudHMudHh0IC10IC9hc3NldC1vdXRwdXQgJiYgY3AgLWF1IC4gL2Fzc2V0LW91dHB1dCcsXG4gICAgICAgICAgICBdLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuICAgIFxuICAgIGNvbnN0IHMzVXBsb2FkTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnUzNVcGxvYWRMYW1iZGEnLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6ICd2aW5jZW50LXZvY2FiLXMzLXVwbG9hZC1sYW1iZGEnLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTIsXG4gICAgICBoYW5kbGVyOiAnbGFtYmRhX2Z1bmN0aW9uLmhhbmRsZXInLFxuICAgICAgY29kZTogczNVcGxvYWRMYW1iZGFDb2RlLFxuICAgICAgcm9sZTogczNVcGxvYWRMYW1iZGFSb2xlLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUFJPQ0VTU0lOR19RVUVVRV9VUkw6IHByb2Nlc3NpbmdRdWV1ZS5xdWV1ZVVybCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBTMyBFdmVudCBOb3RpZmljYXRpb24gLSB0cmlnZ2VyIExhbWJkYSBvbiBvYmplY3QgY3JlYXRpb25cbiAgICBlc3NheXNCdWNrZXQuYWRkRXZlbnROb3RpZmljYXRpb24oXG4gICAgICBzMy5FdmVudFR5cGUuT0JKRUNUX0NSRUFURUQsXG4gICAgICBuZXcgczNuLkxhbWJkYURlc3RpbmF0aW9uKHMzVXBsb2FkTGFtYmRhKSxcbiAgICAgIHsgcHJlZml4OiAnZXNzYXlzLycgfVxuICAgICk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIENvZ25pdG8gVXNlciBQb29sIChFcGljIDYpXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIC8vIENvZ25pdG8gVXNlciBQb29sIGZvciB0ZWFjaGVyIGF1dGhlbnRpY2F0aW9uXG4gICAgY29uc3QgdXNlclBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCAnVm9jYWJUZWFjaGVyc1Bvb2wnLCB7XG4gICAgICB1c2VyUG9vbE5hbWU6ICd2aW5jZW50LXZvY2FiLXRlYWNoZXJzLXBvb2wnLFxuICAgICAgc2lnbkluQWxpYXNlczoge1xuICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgICAgdXNlcm5hbWU6IGZhbHNlLFxuICAgICAgfSxcbiAgICAgIGF1dG9WZXJpZnk6IHtcbiAgICAgICAgZW1haWw6IHRydWUsXG4gICAgICB9LFxuICAgICAgcGFzc3dvcmRQb2xpY3k6IHtcbiAgICAgICAgbWluTGVuZ3RoOiA4LFxuICAgICAgICByZXF1aXJlTG93ZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlVXBwZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlRGlnaXRzOiB0cnVlLFxuICAgICAgICByZXF1aXJlU3ltYm9sczogZmFsc2UsXG4gICAgICB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSwgLy8gRm9yIFBvQ1xuICAgICAgbWZhOiBjb2duaXRvLk1mYS5PRkYsIC8vIE5vIE1GQSBmb3IgUG9DXG4gICAgfSk7XG5cbiAgICAvLyBDb2duaXRvIFVzZXIgUG9vbCBDbGllbnQgZm9yIGZyb250ZW5kXG4gICAgY29uc3QgdXNlclBvb2xDbGllbnQgPSBuZXcgY29nbml0by5Vc2VyUG9vbENsaWVudCh0aGlzLCAnVm9jYWJUZWFjaGVyc1Bvb2xDbGllbnQnLCB7XG4gICAgICB1c2VyUG9vbCxcbiAgICAgIHVzZXJQb29sQ2xpZW50TmFtZTogJ3ZpbmNlbnQtdm9jYWItdGVhY2hlcnMtY2xpZW50JyxcbiAgICAgIGdlbmVyYXRlU2VjcmV0OiBmYWxzZSwgLy8gUHVibGljIGNsaWVudCBmb3IgZnJvbnRlbmRcbiAgICAgIGF1dGhGbG93czoge1xuICAgICAgICB1c2VyUGFzc3dvcmQ6IHRydWUsIC8vIEFsbG93IHVzZXJuYW1lL3Bhc3N3b3JkIGF1dGhcbiAgICAgICAgdXNlclNycDogdHJ1ZSwgLy8gQWxsb3cgU1JQIGF1dGhcbiAgICAgIH0sXG4gICAgICBwcmV2ZW50VXNlckV4aXN0ZW5jZUVycm9yczogdHJ1ZSwgLy8gU2VjdXJpdHkgYmVzdCBwcmFjdGljZVxuICAgIH0pO1xuXG4gICAgLy8gQ29nbml0byBVc2VyIFBvb2wgRG9tYWluIChmb3IgSG9zdGVkIFVJKVxuICAgIGNvbnN0IHVzZXJQb29sRG9tYWluID0gdXNlclBvb2wuYWRkRG9tYWluKCdWb2NhYlRlYWNoZXJzUG9vbERvbWFpbicsIHtcbiAgICAgIGNvZ25pdG9Eb21haW46IHtcbiAgICAgICAgZG9tYWluUHJlZml4OiBgdmluY2VudC12b2NhYi0ke3RoaXMuYWNjb3VudH1gLCAvLyBNdXN0IGJlIGdsb2JhbGx5IHVuaXF1ZVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIEFQSSBHYXRld2F5XG4gICAgY29uc3QgYXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCAnVm9jYWJBcGknLCB7XG4gICAgICByZXN0QXBpTmFtZTogJ3ZpbmNlbnQtdm9jYWItZXNzYXktYW5hbHl6ZXItYXBpJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIGZvciB2b2NhYnVsYXJ5IGVzc2F5IGFuYWx5c2lzJyxcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xuICAgICAgICBhbGxvd09yaWdpbnM6IGFwaWdhdGV3YXkuQ29ycy5BTExfT1JJR0lOUyxcbiAgICAgICAgYWxsb3dNZXRob2RzOiBhcGlnYXRld2F5LkNvcnMuQUxMX01FVEhPRFMsXG4gICAgICAgIGFsbG93SGVhZGVyczogWydDb250ZW50LVR5cGUnLCAnWC1BbXotRGF0ZScsICdBdXRob3JpemF0aW9uJywgJ1gtQXBpLUtleSddLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENvZ25pdG8gQXV0aG9yaXplciBmb3IgQVBJIEdhdGV3YXlcbiAgICBjb25zdCBjb2duaXRvQXV0aG9yaXplciA9IG5ldyBhcGlnYXRld2F5LkNvZ25pdG9Vc2VyUG9vbHNBdXRob3JpemVyKHRoaXMsICdDb2duaXRvQXV0aG9yaXplcicsIHtcbiAgICAgIGNvZ25pdG9Vc2VyUG9vbHM6IFt1c2VyUG9vbF0sXG4gICAgICBhdXRob3JpemVyTmFtZTogJ3ZpbmNlbnQtdm9jYWItY29nbml0by1hdXRob3JpemVyJyxcbiAgICAgIGlkZW50aXR5U291cmNlOiAnbWV0aG9kLnJlcXVlc3QuaGVhZGVyLkF1dGhvcml6YXRpb24nLFxuICAgIH0pO1xuXG4gICAgLy8gQVBJIEdhdGV3YXkgSW50ZWdyYXRpb25cbiAgICBjb25zdCBhcGlJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGFwaUxhbWJkYSk7XG5cbiAgICAvLyBIZWFsdGggY2hlY2sgZW5kcG9pbnQgKHB1YmxpYywgbm8gYXV0aCByZXF1aXJlZClcbiAgICBjb25zdCBoZWFsdGhSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdoZWFsdGgnKTtcbiAgICBoZWFsdGhSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIGFwaUludGVncmF0aW9uKTtcblxuICAgIC8vIEF1dGggZW5kcG9pbnQgKHB1YmxpYywgbm8gYXV0aCByZXF1aXJlZCBmb3IgL2F1dGgvaGVhbHRoKVxuICAgIGNvbnN0IGF1dGhSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdhdXRoJyk7XG4gICAgY29uc3QgYXV0aEhlYWx0aFJlc291cmNlID0gYXV0aFJlc291cmNlLmFkZFJlc291cmNlKCdoZWFsdGgnKTtcbiAgICBhdXRoSGVhbHRoUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBhcGlJbnRlZ3JhdGlvbik7XG5cbiAgICAvLyBQcm90ZWN0ZWQgZW5kcG9pbnRzIChyZXF1aXJlIENvZ25pdG8gYXV0aGVudGljYXRpb24pXG4gICAgY29uc3QgYXV0aG9yaXplck9wdGlvbnMgPSB7XG4gICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfTtcblxuICAgIC8vIFBPU1QgL2Vzc2F5IGVuZHBvaW50IChwcm90ZWN0ZWQpXG4gICAgY29uc3QgZXNzYXlSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdlc3NheScpO1xuICAgIGVzc2F5UmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgYXBpSW50ZWdyYXRpb24sIGF1dGhvcml6ZXJPcHRpb25zKTtcblxuICAgIC8vIEdFVCAvZXNzYXkve2Vzc2F5X2lkfSBlbmRwb2ludCAocHJvdGVjdGVkKVxuICAgIGNvbnN0IGVzc2F5SWRSZXNvdXJjZSA9IGVzc2F5UmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3tlc3NheV9pZH0nKTtcbiAgICBlc3NheUlkUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBhcGlJbnRlZ3JhdGlvbiwgYXV0aG9yaXplck9wdGlvbnMpO1xuXG4gICAgLy8gU3R1ZGVudHMgZW5kcG9pbnRzIChwcm90ZWN0ZWQpIC0gd2lsbCBiZSBhZGRlZCBpbiBFcGljIDdcbiAgICBjb25zdCBzdHVkZW50c1Jlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ3N0dWRlbnRzJyk7XG4gICAgLy8gV2lsbCBhZGQgbWV0aG9kcyBpbiBFcGljIDdcblxuICAgIC8vIEFzc2lnbm1lbnRzIGVuZHBvaW50cyAocHJvdGVjdGVkKSAtIHdpbGwgYmUgYWRkZWQgaW4gRXBpYyA3XG4gICAgY29uc3QgYXNzaWdubWVudHNSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdhc3NpZ25tZW50cycpO1xuICAgIC8vIFdpbGwgYWRkIG1ldGhvZHMgaW4gRXBpYyA3XG5cbiAgICAvLyBNZXRyaWNzIGVuZHBvaW50cyAocHJvdGVjdGVkKSAtIHdpbGwgYmUgYWRkZWQgaW4gRXBpYyA4XG4gICAgY29uc3QgbWV0cmljc1Jlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ21ldHJpY3MnKTtcbiAgICAvLyBXaWxsIGFkZCBtZXRob2RzIGluIEVwaWMgOFxuXG4gICAgLy8gUHJvY2Vzc29yIExhbWJkYSBGdW5jdGlvbiAoQ29udGFpbmVyIEltYWdlKVxuICAgIC8vIFVzaW5nIGNvbnRhaW5lciBpbWFnZSBpbnN0ZWFkIG9mIGxheWVyIGR1ZSB0byBzaXplIGxpbWl0cyAoc3BhQ3kgKyBtb2RlbCA+IDI1ME1CKVxuICAgIGNvbnN0IHByb2Nlc3NvckxhbWJkYSA9IG5ldyBsYW1iZGEuRG9ja2VySW1hZ2VGdW5jdGlvbih0aGlzLCAnUHJvY2Vzc29yTGFtYmRhJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiAndmluY2VudC12b2NhYi1wcm9jZXNzb3ItbGFtYmRhJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Eb2NrZXJJbWFnZUNvZGUuZnJvbUltYWdlQXNzZXQoXG4gICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGEvcHJvY2Vzc29yJyksXG4gICAgICAgIHtcbiAgICAgICAgICAvLyBEb2NrZXJmaWxlIGlzIGluIGxhbWJkYS9wcm9jZXNzb3IvRG9ja2VyZmlsZVxuICAgICAgICB9XG4gICAgICApLFxuICAgICAgcm9sZTogcHJvY2Vzc29yTGFtYmRhUm9sZSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLCAvLyBNdXN0IG1hdGNoIFNRUyB2aXNpYmlsaXR5IHRpbWVvdXRcbiAgICAgIG1lbW9yeVNpemU6IDMwMDgsIC8vIEhpZ2ggbWVtb3J5IGZvciBzcGFDeSBtb2RlbCBsb2FkaW5nXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBFU1NBWVNfQlVDS0VUOiBlc3NheXNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgTUVUUklDU19UQUJMRTogbWV0cmljc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgQkVEUk9DS19NT0RFTF9JRDogJ2FudGhyb3BpYy5jbGF1ZGUtMy1zb25uZXQtMjAyNDAyMjktdjE6MCcsXG4gICAgICAgIC8vIEFXU19SRUdJT04gaXMgYXV0b21hdGljYWxseSBzZXQgYnkgTGFtYmRhIHJ1bnRpbWVcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBTUVMgRXZlbnQgU291cmNlIGZvciBQcm9jZXNzb3IgTGFtYmRhXG4gICAgcHJvY2Vzc29yTGFtYmRhLmFkZEV2ZW50U291cmNlKFxuICAgICAgbmV3IGxhbWJkYUV2ZW50U291cmNlcy5TcXNFdmVudFNvdXJjZShwcm9jZXNzaW5nUXVldWUsIHtcbiAgICAgICAgYmF0Y2hTaXplOiAxLCAvLyBQcm9jZXNzIG9uZSBlc3NheSBhdCBhIHRpbWVcbiAgICAgICAgbWF4QmF0Y2hpbmdXaW5kb3c6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDApLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBDbG91ZFdhdGNoIE9ic2VydmFiaWxpdHkgKEVwaWMgNSlcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gU05TIFRvcGljIGZvciBhbGFybSBub3RpZmljYXRpb25zIChvcHRpb25hbCAtIGNhbiBiZSBjb25maWd1cmVkIGxhdGVyKVxuICAgIGNvbnN0IGFsYXJtVG9waWMgPSBuZXcgc25zLlRvcGljKHRoaXMsICdBbGFybVRvcGljJywge1xuICAgICAgZGlzcGxheU5hbWU6ICd2aW5jZW50LXZvY2FiLWVzc2F5LWFuYWx5emVyLWFsYXJtcycsXG4gICAgfSk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIEFsYXJtOiBBUEkgTGFtYmRhIEVycm9yc1xuICAgIGNvbnN0IGFwaUxhbWJkYUVycm9yQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnQXBpTGFtYmRhRXJyb3JBbGFybScsIHtcbiAgICAgIGFsYXJtTmFtZTogJ3ZpbmNlbnQtdm9jYWItYXBpLWxhbWJkYS1lcnJvcnMnLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ0FsZXJ0cyB3aGVuIEFQSSBMYW1iZGEgZXJyb3JzIGV4Y2VlZCB0aHJlc2hvbGQnLFxuICAgICAgbWV0cmljOiBhcGlMYW1iZGEubWV0cmljRXJyb3JzKHtcbiAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiA1LCAvLyBBbGVydCBpZiA1KyBlcnJvcnMgaW4gNSBtaW51dGVzXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuICAgIGFwaUxhbWJkYUVycm9yQWxhcm0uYWRkQWxhcm1BY3Rpb24obmV3IGNsb3Vkd2F0Y2hBY3Rpb25zLlNuc0FjdGlvbihhbGFybVRvcGljKSk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIEFsYXJtOiBTMyBVcGxvYWQgTGFtYmRhIEVycm9yc1xuICAgIGNvbnN0IHMzVXBsb2FkTGFtYmRhRXJyb3JBbGFybSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdTM1VwbG9hZExhbWJkYUVycm9yQWxhcm0nLCB7XG4gICAgICBhbGFybU5hbWU6ICd2aW5jZW50LXZvY2FiLXMzLXVwbG9hZC1sYW1iZGEtZXJyb3JzJyxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246ICdBbGVydHMgd2hlbiBTMyBVcGxvYWQgTGFtYmRhIGVycm9ycyBleGNlZWQgdGhyZXNob2xkJyxcbiAgICAgIG1ldHJpYzogczNVcGxvYWRMYW1iZGEubWV0cmljRXJyb3JzKHtcbiAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiA1LCAvLyBBbGVydCBpZiA1KyBlcnJvcnMgaW4gNSBtaW51dGVzXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuICAgIHMzVXBsb2FkTGFtYmRhRXJyb3JBbGFybS5hZGRBbGFybUFjdGlvbihuZXcgY2xvdWR3YXRjaEFjdGlvbnMuU25zQWN0aW9uKGFsYXJtVG9waWMpKTtcblxuICAgIC8vIENsb3VkV2F0Y2ggQWxhcm06IFByb2Nlc3NvciBMYW1iZGEgRXJyb3JzXG4gICAgY29uc3QgcHJvY2Vzc29yTGFtYmRhRXJyb3JBbGFybSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdQcm9jZXNzb3JMYW1iZGFFcnJvckFsYXJtJywge1xuICAgICAgYWxhcm1OYW1lOiAndmluY2VudC12b2NhYi1wcm9jZXNzb3ItbGFtYmRhLWVycm9ycycsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnQWxlcnRzIHdoZW4gUHJvY2Vzc29yIExhbWJkYSBlcnJvcnMgZXhjZWVkIHRocmVzaG9sZCcsXG4gICAgICBtZXRyaWM6IHByb2Nlc3NvckxhbWJkYS5tZXRyaWNFcnJvcnMoe1xuICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDMsIC8vIEFsZXJ0IGlmIDMrIGVycm9ycyBpbiA1IG1pbnV0ZXMgKG1vcmUgY3JpdGljYWwpXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuICAgIHByb2Nlc3NvckxhbWJkYUVycm9yQWxhcm0uYWRkQWxhcm1BY3Rpb24obmV3IGNsb3Vkd2F0Y2hBY3Rpb25zLlNuc0FjdGlvbihhbGFybVRvcGljKSk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIEFsYXJtOiBEZWFkIExldHRlciBRdWV1ZSBNZXNzYWdlcyAoRmFpbGVkIFByb2Nlc3NpbmcpXG4gICAgY29uc3QgZGxxQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnRExRQWxhcm0nLCB7XG4gICAgICBhbGFybU5hbWU6ICd2aW5jZW50LXZvY2FiLWRscS1tZXNzYWdlcycsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnQWxlcnRzIHdoZW4gbWVzc2FnZXMgYXJlIHNlbnQgdG8gRExRIChwcm9jZXNzaW5nIGZhaWx1cmVzKScsXG4gICAgICBtZXRyaWM6IGRscS5tZXRyaWNBcHByb3hpbWF0ZU51bWJlck9mTWVzc2FnZXNWaXNpYmxlKHtcbiAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiAxLCAvLyBBbGVydCBpZiBhbnkgbWVzc2FnZSBpbiBETFFcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG4gICAgZGxxQWxhcm0uYWRkQWxhcm1BY3Rpb24obmV3IGNsb3Vkd2F0Y2hBY3Rpb25zLlNuc0FjdGlvbihhbGFybVRvcGljKSk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIEFsYXJtOiBQcm9jZXNzb3IgTGFtYmRhIFRocm90dGxlcyAoT3B0aW9uYWwpXG4gICAgY29uc3QgcHJvY2Vzc29yTGFtYmRhVGhyb3R0bGVBbGFybSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdQcm9jZXNzb3JMYW1iZGFUaHJvdHRsZUFsYXJtJywge1xuICAgICAgYWxhcm1OYW1lOiAndmluY2VudC12b2NhYi1wcm9jZXNzb3ItbGFtYmRhLXRocm90dGxlcycsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnQWxlcnRzIHdoZW4gUHJvY2Vzc29yIExhbWJkYSBpcyB0aHJvdHRsZWQnLFxuICAgICAgbWV0cmljOiBwcm9jZXNzb3JMYW1iZGEubWV0cmljVGhyb3R0bGVzKHtcbiAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiAxLCAvLyBBbGVydCBpZiBhbnkgdGhyb3R0bGVzXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuICAgIHByb2Nlc3NvckxhbWJkYVRocm90dGxlQWxhcm0uYWRkQWxhcm1BY3Rpb24obmV3IGNsb3Vkd2F0Y2hBY3Rpb25zLlNuc0FjdGlvbihhbGFybVRvcGljKSk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIEFsYXJtOiBQcm9jZXNzb3IgTGFtYmRhIER1cmF0aW9uIChIaWdoIER1cmF0aW9uIFdhcm5pbmcpXG4gICAgY29uc3QgcHJvY2Vzc29yTGFtYmRhRHVyYXRpb25BbGFybSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdQcm9jZXNzb3JMYW1iZGFEdXJhdGlvbkFsYXJtJywge1xuICAgICAgYWxhcm1OYW1lOiAndmluY2VudC12b2NhYi1wcm9jZXNzb3ItbGFtYmRhLWR1cmF0aW9uJyxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246ICdBbGVydHMgd2hlbiBQcm9jZXNzb3IgTGFtYmRhIGR1cmF0aW9uIGlzIGhpZ2ggKGFwcHJvYWNoaW5nIHRpbWVvdXQpJyxcbiAgICAgIG1ldHJpYzogcHJvY2Vzc29yTGFtYmRhLm1ldHJpY0R1cmF0aW9uKHtcbiAgICAgICAgc3RhdGlzdGljOiAnQXZlcmFnZScsXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogMjQwMDAwLCAvLyA0IG1pbnV0ZXMgKDgwJSBvZiA1LW1pbnV0ZSB0aW1lb3V0KVxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDIsIC8vIE11c3QgZXhjZWVkIHRocmVzaG9sZCBmb3IgMiBwZXJpb2RzXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcbiAgICBwcm9jZXNzb3JMYW1iZGFEdXJhdGlvbkFsYXJtLmFkZEFsYXJtQWN0aW9uKG5ldyBjbG91ZHdhdGNoQWN0aW9ucy5TbnNBY3Rpb24oYWxhcm1Ub3BpYykpO1xuXG4gICAgLy8gQ2xvdWRGb3JtYXRpb24gT3V0cHV0c1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdFc3NheXNCdWNrZXROYW1lJywge1xuICAgICAgdmFsdWU6IGVzc2F5c0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdTMyBidWNrZXQgbmFtZSBmb3IgZXNzYXkgc3RvcmFnZScsXG4gICAgICBleHBvcnROYW1lOiAnRXNzYXlzQnVja2V0TmFtZScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUHJvY2Vzc2luZ1F1ZXVlVXJsJywge1xuICAgICAgdmFsdWU6IHByb2Nlc3NpbmdRdWV1ZS5xdWV1ZVVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU1FTIHF1ZXVlIFVSTCBmb3IgZXNzYXkgcHJvY2Vzc2luZycsXG4gICAgICBleHBvcnROYW1lOiAnUHJvY2Vzc2luZ1F1ZXVlVXJsJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdNZXRyaWNzVGFibGVOYW1lJywge1xuICAgICAgdmFsdWU6IG1ldHJpY3NUYWJsZS50YWJsZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0R5bmFtb0RCIHRhYmxlIG5hbWUgZm9yIGVzc2F5IG1ldHJpY3MnLFxuICAgICAgZXhwb3J0TmFtZTogJ01ldHJpY3NUYWJsZU5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaUxhbWJkYVJvbGVBcm4nLCB7XG4gICAgICB2YWx1ZTogYXBpTGFtYmRhUm9sZS5yb2xlQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdJQU0gcm9sZSBBUk4gZm9yIEFQSSBMYW1iZGEnLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwaUxhbWJkYVJvbGVBcm4nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1MzVXBsb2FkTGFtYmRhUm9sZUFybicsIHtcbiAgICAgIHZhbHVlOiBzM1VwbG9hZExhbWJkYVJvbGUucm9sZUFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnSUFNIHJvbGUgQVJOIGZvciBTMyB1cGxvYWQgdHJpZ2dlciBMYW1iZGEnLFxuICAgICAgZXhwb3J0TmFtZTogJ1MzVXBsb2FkTGFtYmRhUm9sZUFybicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUHJvY2Vzc29yTGFtYmRhUm9sZUFybicsIHtcbiAgICAgIHZhbHVlOiBwcm9jZXNzb3JMYW1iZGFSb2xlLnJvbGVBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0lBTSByb2xlIEFSTiBmb3IgcHJvY2Vzc29yIExhbWJkYScsXG4gICAgICBleHBvcnROYW1lOiAnUHJvY2Vzc29yTGFtYmRhUm9sZUFybicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBpVXJsJywge1xuICAgICAgdmFsdWU6IGFwaS51cmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBHYXRld2F5IGVuZHBvaW50IFVSTCcsXG4gICAgICBleHBvcnROYW1lOiAnQXBpVXJsJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQcm9jZXNzb3JMYW1iZGFBcm4nLCB7XG4gICAgICB2YWx1ZTogcHJvY2Vzc29yTGFtYmRhLmZ1bmN0aW9uQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdQcm9jZXNzb3IgTGFtYmRhIGZ1bmN0aW9uIEFSTicsXG4gICAgICBleHBvcnROYW1lOiAnUHJvY2Vzc29yTGFtYmRhQXJuJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBbGFybVRvcGljQXJuJywge1xuICAgICAgdmFsdWU6IGFsYXJtVG9waWMudG9waWNBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ1NOUyB0b3BpYyBBUk4gZm9yIENsb3VkV2F0Y2ggYWxhcm0gbm90aWZpY2F0aW9ucycsXG4gICAgICBleHBvcnROYW1lOiAnQWxhcm1Ub3BpY0FybicsXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIENvZ25pdG8gT3V0cHV0cyAoRXBpYyA2KVxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ29nbml0b1VzZXJQb29sSWQnLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgSUQgZm9yIHRlYWNoZXIgYXV0aGVudGljYXRpb24nLFxuICAgICAgZXhwb3J0TmFtZTogJ0NvZ25pdG9Vc2VyUG9vbElkJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDb2duaXRvVXNlclBvb2xDbGllbnRJZCcsIHtcbiAgICAgIHZhbHVlOiB1c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBDbGllbnQgSUQgZm9yIGZyb250ZW5kJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdDb2duaXRvVXNlclBvb2xDbGllbnRJZCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ29nbml0b1JlZ2lvbicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnJlZ2lvbixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVdTIHJlZ2lvbiBmb3IgQ29nbml0bycsXG4gICAgICBleHBvcnROYW1lOiAnQ29nbml0b1JlZ2lvbicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ29nbml0b0hvc3RlZFVpVXJsJywge1xuICAgICAgdmFsdWU6IGBodHRwczovLyR7dXNlclBvb2xEb21haW4uZG9tYWluTmFtZX0uYXV0aC4ke3RoaXMucmVnaW9ufS5hbWF6b25jb2duaXRvLmNvbWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gSG9zdGVkIFVJIFVSTCcsXG4gICAgICBleHBvcnROYW1lOiAnQ29nbml0b0hvc3RlZFVpVXJsJyxcbiAgICB9KTtcbiAgfVxufVxuIl19
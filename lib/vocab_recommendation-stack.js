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
const path = __importStar(require("path"));
class VocabRecommendationStack extends cdk.Stack {
    constructor(scope, id, props) {
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
        essaysBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(s3UploadLambda), { prefix: 'essays/' });
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
exports.VocabRecommendationStack = VocabRecommendationStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidm9jYWJfcmVjb21tZW5kYXRpb24tc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2b2NhYl9yZWNvbW1lbmRhdGlvbi1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUVuQyx1REFBeUM7QUFDekMsbUVBQXFEO0FBQ3JELHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MsK0RBQWlEO0FBQ2pELHVFQUF5RDtBQUN6RCxzRUFBd0Q7QUFDeEQseUZBQTJFO0FBQzNFLDJDQUE2QjtBQUU3QixNQUFhLHdCQUF5QixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3JELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsOEJBQThCO1FBQzlCLE1BQU0sWUFBWSxHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQ3ZELFVBQVUsRUFBRSxnQkFBZ0IsSUFBSSxDQUFDLE9BQU8sSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFO1lBQ3pELGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxtQ0FBbUM7WUFDN0UsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLHFEQUFxRDtZQUM5RSxTQUFTLEVBQUUsS0FBSztZQUNoQixVQUFVLEVBQUUsRUFBRSxDQUFDLGdCQUFnQixDQUFDLFVBQVU7WUFDMUMsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLGlCQUFpQixDQUFDLFNBQVM7WUFDakQsSUFBSSxFQUFFO2dCQUNKO29CQUNFLGNBQWMsRUFBRSxDQUFDLEdBQUcsQ0FBQztvQkFDckIsY0FBYyxFQUFFLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLFdBQVcsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUM7b0JBQzdFLGNBQWMsRUFBRSxDQUFDLEdBQUcsQ0FBQztvQkFDckIsTUFBTSxFQUFFLElBQUk7aUJBQ2I7YUFDRjtTQUNGLENBQUMsQ0FBQztRQUVILHdCQUF3QjtRQUN4QixNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUMvQyxTQUFTLEVBQUUsc0JBQXNCO1lBQ2pDLGVBQWUsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDdEMsVUFBVSxFQUFFLEdBQUcsQ0FBQyxlQUFlLENBQUMsV0FBVztTQUM1QyxDQUFDLENBQUM7UUFFSCxpQ0FBaUM7UUFDakMsTUFBTSxlQUFlLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxzQkFBc0IsRUFBRTtZQUNsRSxTQUFTLEVBQUUsd0JBQXdCO1lBQ25DLGlCQUFpQixFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLDRCQUE0QjtZQUN4RSxlQUFlLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ3RDLFVBQVUsRUFBRSxHQUFHLENBQUMsZUFBZSxDQUFDLFdBQVc7WUFDM0MsZUFBZSxFQUFFO2dCQUNmLEtBQUssRUFBRSxHQUFHO2dCQUNWLGVBQWUsRUFBRSxDQUFDLEVBQUUsc0NBQXNDO2FBQzNEO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsbUNBQW1DO1FBQ25DLE1BQU0sWUFBWSxHQUFHLElBQUksUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQzVELFNBQVMsRUFBRSxjQUFjO1lBQ3pCLFlBQVksRUFBRSxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFO1lBQ3ZFLFdBQVcsRUFBRSxRQUFRLENBQUMsV0FBVyxDQUFDLGVBQWUsRUFBRSw0QkFBNEI7WUFDL0UsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFLGtDQUFrQztZQUM1RSxnQ0FBZ0MsRUFBRTtnQkFDaEMsMEJBQTBCLEVBQUUsS0FBSyxFQUFFLDRCQUE0QjthQUNoRTtZQUNELFVBQVUsRUFBRSxRQUFRLENBQUMsZUFBZSxDQUFDLFdBQVc7U0FDakQsQ0FBQyxDQUFDO1FBRUgsbURBQW1EO1FBQ25ELE1BQU0sYUFBYSxHQUFHLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQ3hELFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxzQkFBc0IsQ0FBQztZQUMzRCxXQUFXLEVBQUUsa0NBQWtDO1lBQy9DLGVBQWUsRUFBRTtnQkFDZixHQUFHLENBQUMsYUFBYSxDQUFDLHdCQUF3QixDQUFDLDBDQUEwQyxDQUFDO2FBQ3ZGO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsbUNBQW1DO1FBQ25DLFlBQVksQ0FBQyxjQUFjLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDM0MsWUFBWSxDQUFDLGtCQUFrQixDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQy9DLGVBQWUsQ0FBQyxpQkFBaUIsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUVqRCx5REFBeUQ7UUFDekQsNkRBQTZEO1FBQzdELE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUNsRSxTQUFTLEVBQUUsSUFBSSxHQUFHLENBQUMsZ0JBQWdCLENBQUMsc0JBQXNCLENBQUM7WUFDM0QsV0FBVyxFQUFFLGdEQUFnRDtZQUM3RCxlQUFlLEVBQUU7Z0JBQ2YsR0FBRyxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBQywwQ0FBMEMsQ0FBQzthQUN2RjtTQUNGLENBQUMsQ0FBQztRQUVILHlDQUF5QztRQUN6QyxZQUFZLENBQUMsU0FBUyxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDM0MsZUFBZSxDQUFDLGlCQUFpQixDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFFdEQseURBQXlEO1FBQ3pELE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxxQkFBcUIsRUFBRTtZQUNwRSxTQUFTLEVBQUUsSUFBSSxHQUFHLENBQUMsZ0JBQWdCLENBQUMsc0JBQXNCLENBQUM7WUFDM0QsV0FBVyxFQUFFLDhDQUE4QztZQUMzRCxlQUFlLEVBQUU7Z0JBQ2YsR0FBRyxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBQywwQ0FBMEMsQ0FBQzthQUN2RjtTQUNGLENBQUMsQ0FBQztRQUVILHlDQUF5QztRQUN6QyxZQUFZLENBQUMsU0FBUyxDQUFDLG1CQUFtQixDQUFDLENBQUM7UUFDNUMsWUFBWSxDQUFDLGtCQUFrQixDQUFDLG1CQUFtQixDQUFDLENBQUM7UUFDckQsZUFBZSxDQUFDLG9CQUFvQixDQUFDLG1CQUFtQixDQUFDLENBQUM7UUFFMUQsaURBQWlEO1FBQ2pELG1CQUFtQixDQUFDLFdBQVcsQ0FDN0IsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1lBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7WUFDeEIsT0FBTyxFQUFFLENBQUMscUJBQXFCLENBQUM7WUFDaEMsU0FBUyxFQUFFO2dCQUNULG1CQUFtQixJQUFJLENBQUMsTUFBTSxnREFBZ0Q7Z0JBQzlFLG1CQUFtQixJQUFJLENBQUMsTUFBTSwrQ0FBK0M7Z0JBQzdFLG1CQUFtQixJQUFJLENBQUMsTUFBTSw4Q0FBOEM7YUFDN0U7U0FDRixDQUFDLENBQ0gsQ0FBQztRQUVGLHNCQUFzQjtRQUN0QiwyREFBMkQ7UUFDM0QsTUFBTSxhQUFhLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsS0FBSyxNQUFNO1lBQzVELENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxlQUFlLENBQUMsQ0FBQztZQUM5RCxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsZUFBZSxDQUFDLEVBQUU7Z0JBQzNELFFBQVEsRUFBRTtvQkFDUixLQUFLLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsYUFBYTtvQkFDL0MsT0FBTyxFQUFFO3dCQUNQLE1BQU0sRUFBRSxJQUFJO3dCQUNaLDRFQUE0RTtxQkFDN0U7aUJBQ0Y7YUFDRixDQUFDLENBQUM7UUFFUCxNQUFNLFNBQVMsR0FBRyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLFdBQVcsRUFBRTtZQUN2RCxPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBQ25DLE9BQU8sRUFBRSx5QkFBeUI7WUFDbEMsSUFBSSxFQUFFLGFBQWE7WUFDbkIsSUFBSSxFQUFFLGFBQWE7WUFDbkIsT0FBTyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNqQyxXQUFXLEVBQUU7Z0JBQ1gsYUFBYSxFQUFFLFlBQVksQ0FBQyxVQUFVO2dCQUN0QyxhQUFhLEVBQUUsWUFBWSxDQUFDLFNBQVM7Z0JBQ3JDLG9CQUFvQixFQUFFLGVBQWUsQ0FBQyxRQUFRO2FBQy9DO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsb0NBQW9DO1FBQ3BDLDJEQUEyRDtRQUMzRCxNQUFNLGtCQUFrQixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEtBQUssTUFBTTtZQUNqRSxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsNkJBQTZCLENBQUMsQ0FBQztZQUM1RSxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsNkJBQTZCLENBQUMsRUFBRTtnQkFDekUsUUFBUSxFQUFFO29CQUNSLEtBQUssRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxhQUFhO29CQUMvQyxPQUFPLEVBQUU7d0JBQ1AsTUFBTSxFQUFFLElBQUk7d0JBQ1osNEVBQTRFO3FCQUM3RTtpQkFDRjthQUNGLENBQUMsQ0FBQztRQUVQLE1BQU0sY0FBYyxHQUFHLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDakUsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVztZQUNuQyxPQUFPLEVBQUUseUJBQXlCO1lBQ2xDLElBQUksRUFBRSxrQkFBa0I7WUFDeEIsSUFBSSxFQUFFLGtCQUFrQjtZQUN4QixPQUFPLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ2pDLFdBQVcsRUFBRTtnQkFDWCxvQkFBb0IsRUFBRSxlQUFlLENBQUMsUUFBUTthQUMvQztTQUNGLENBQUMsQ0FBQztRQUVILDREQUE0RDtRQUM1RCxZQUFZLENBQUMsb0JBQW9CLENBQy9CLEVBQUUsQ0FBQyxTQUFTLENBQUMsY0FBYyxFQUMzQixJQUFJLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxjQUFjLENBQUMsRUFDekMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLENBQ3RCLENBQUM7UUFFRixjQUFjO1FBQ2QsTUFBTSxHQUFHLEdBQUcsSUFBSSxVQUFVLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxVQUFVLEVBQUU7WUFDbkQsV0FBVyxFQUFFLCtCQUErQjtZQUM1QyxXQUFXLEVBQUUsbUNBQW1DO1lBQ2hELDJCQUEyQixFQUFFO2dCQUMzQixZQUFZLEVBQUUsVUFBVSxDQUFDLElBQUksQ0FBQyxXQUFXO2dCQUN6QyxZQUFZLEVBQUUsVUFBVSxDQUFDLElBQUksQ0FBQyxXQUFXO2dCQUN6QyxZQUFZLEVBQUUsQ0FBQyxjQUFjLEVBQUUsWUFBWSxFQUFFLGVBQWUsRUFBRSxXQUFXLENBQUM7YUFDM0U7U0FDRixDQUFDLENBQUM7UUFFSCwwQkFBMEI7UUFDMUIsTUFBTSxjQUFjLEdBQUcsSUFBSSxVQUFVLENBQUMsaUJBQWlCLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFbkUsdUJBQXVCO1FBQ3ZCLE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3BELGFBQWEsQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBRWhELGlDQUFpQztRQUNqQyxNQUFNLGVBQWUsR0FBRyxhQUFhLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ2hFLGVBQWUsQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBRWpELHdCQUF3QjtRQUN4QixNQUFNLGNBQWMsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN0RCxjQUFjLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxjQUFjLENBQUMsQ0FBQztRQUVoRCw4Q0FBOEM7UUFDOUMsb0ZBQW9GO1FBQ3BGLE1BQU0sZUFBZSxHQUFHLElBQUksTUFBTSxDQUFDLG1CQUFtQixDQUFDLElBQUksRUFBRSxpQkFBaUIsRUFBRTtZQUM5RSxJQUFJLEVBQUUsTUFBTSxDQUFDLGVBQWUsQ0FBQyxjQUFjLENBQ3pDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLHFCQUFxQixDQUFDLEVBQzNDO1lBQ0UsK0NBQStDO2FBQ2hELENBQ0Y7WUFDRCxJQUFJLEVBQUUsbUJBQW1CO1lBQ3pCLE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxvQ0FBb0M7WUFDdEUsVUFBVSxFQUFFLElBQUksRUFBRSxzQ0FBc0M7WUFDeEQsV0FBVyxFQUFFO2dCQUNYLGFBQWEsRUFBRSxZQUFZLENBQUMsVUFBVTtnQkFDdEMsYUFBYSxFQUFFLFlBQVksQ0FBQyxTQUFTO2dCQUNyQyxnQkFBZ0IsRUFBRSx5Q0FBeUM7Z0JBQzNELG9EQUFvRDthQUNyRDtTQUNGLENBQUMsQ0FBQztRQUVILHdDQUF3QztRQUN4QyxlQUFlLENBQUMsY0FBYyxDQUM1QixJQUFJLGtCQUFrQixDQUFDLGNBQWMsQ0FBQyxlQUFlLEVBQUU7WUFDckQsU0FBUyxFQUFFLENBQUMsRUFBRSw4QkFBOEI7WUFDNUMsaUJBQWlCLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1NBQzNDLENBQUMsQ0FDSCxDQUFDO1FBRUYseUJBQXlCO1FBQ3pCLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDMUMsS0FBSyxFQUFFLFlBQVksQ0FBQyxVQUFVO1lBQzlCLFdBQVcsRUFBRSxrQ0FBa0M7WUFDL0MsVUFBVSxFQUFFLGtCQUFrQjtTQUMvQixDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQzVDLEtBQUssRUFBRSxlQUFlLENBQUMsUUFBUTtZQUMvQixXQUFXLEVBQUUsb0NBQW9DO1lBQ2pELFVBQVUsRUFBRSxvQkFBb0I7U0FDakMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUMxQyxLQUFLLEVBQUUsWUFBWSxDQUFDLFNBQVM7WUFDN0IsV0FBVyxFQUFFLHVDQUF1QztZQUNwRCxVQUFVLEVBQUUsa0JBQWtCO1NBQy9CLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDMUMsS0FBSyxFQUFFLGFBQWEsQ0FBQyxPQUFPO1lBQzVCLFdBQVcsRUFBRSw2QkFBNkI7WUFDMUMsVUFBVSxFQUFFLGtCQUFrQjtTQUMvQixDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHVCQUF1QixFQUFFO1lBQy9DLEtBQUssRUFBRSxrQkFBa0IsQ0FBQyxPQUFPO1lBQ2pDLFdBQVcsRUFBRSwyQ0FBMkM7WUFDeEQsVUFBVSxFQUFFLHVCQUF1QjtTQUNwQyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHdCQUF3QixFQUFFO1lBQ2hELEtBQUssRUFBRSxtQkFBbUIsQ0FBQyxPQUFPO1lBQ2xDLFdBQVcsRUFBRSxtQ0FBbUM7WUFDaEQsVUFBVSxFQUFFLHdCQUF3QjtTQUNyQyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFFBQVEsRUFBRTtZQUNoQyxLQUFLLEVBQUUsR0FBRyxDQUFDLEdBQUc7WUFDZCxXQUFXLEVBQUUsMEJBQTBCO1lBQ3ZDLFVBQVUsRUFBRSxRQUFRO1NBQ3JCLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsb0JBQW9CLEVBQUU7WUFDNUMsS0FBSyxFQUFFLGVBQWUsQ0FBQyxXQUFXO1lBQ2xDLFdBQVcsRUFBRSwrQkFBK0I7WUFDNUMsVUFBVSxFQUFFLG9CQUFvQjtTQUNqQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUE5UUQsNERBOFFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XG5pbXBvcnQgKiBhcyBzcXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNxcyc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcbmltcG9ydCAqIGFzIHMzbiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMtbm90aWZpY2F0aW9ucyc7XG5pbXBvcnQgKiBhcyBsYW1iZGFFdmVudFNvdXJjZXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYS1ldmVudC1zb3VyY2VzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5cbmV4cG9ydCBjbGFzcyBWb2NhYlJlY29tbWVuZGF0aW9uU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAvLyBTMyBCdWNrZXQgZm9yIGVzc2F5IHVwbG9hZHNcbiAgICBjb25zdCBlc3NheXNCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdFc3NheXNCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgdm9jYWItZXNzYXlzLSR7dGhpcy5hY2NvdW50fS0ke3RoaXMucmVnaW9ufWAsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLCAvLyBGb3IgUG9DIC0gYWxsb3dzIGJ1Y2tldCBkZWxldGlvblxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsIC8vIEF1dG9tYXRpY2FsbHkgZGVsZXRlIG9iamVjdHMgd2hlbiBzdGFjayBpcyBkZWxldGVkXG4gICAgICB2ZXJzaW9uZWQ6IGZhbHNlLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIGNvcnM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGFsbG93ZWRPcmlnaW5zOiBbJyonXSxcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogW3MzLkh0dHBNZXRob2RzLkdFVCwgczMuSHR0cE1ldGhvZHMuUFVULCBzMy5IdHRwTWV0aG9kcy5QT1NUXSxcbiAgICAgICAgICBhbGxvd2VkSGVhZGVyczogWycqJ10sXG4gICAgICAgICAgbWF4QWdlOiAzNjAwLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIFNRUyBEZWFkIExldHRlciBRdWV1ZVxuICAgIGNvbnN0IGRscSA9IG5ldyBzcXMuUXVldWUodGhpcywgJ1Byb2Nlc3NpbmdETFEnLCB7XG4gICAgICBxdWV1ZU5hbWU6ICdlc3NheS1wcm9jZXNzaW5nLWRscScsXG4gICAgICByZXRlbnRpb25QZXJpb2Q6IGNkay5EdXJhdGlvbi5kYXlzKDE0KSxcbiAgICAgIGVuY3J5cHRpb246IHNxcy5RdWV1ZUVuY3J5cHRpb24uU1FTX01BTkFHRUQsXG4gICAgfSk7XG5cbiAgICAvLyBTUVMgUXVldWUgZm9yIGVzc2F5IHByb2Nlc3NpbmdcbiAgICBjb25zdCBwcm9jZXNzaW5nUXVldWUgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsICdFc3NheVByb2Nlc3NpbmdRdWV1ZScsIHtcbiAgICAgIHF1ZXVlTmFtZTogJ2Vzc2F5LXByb2Nlc3NpbmctcXVldWUnLFxuICAgICAgdmlzaWJpbGl0eVRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLCAvLyBNdXN0IGJlID49IExhbWJkYSB0aW1lb3V0XG4gICAgICByZXRlbnRpb25QZXJpb2Q6IGNkay5EdXJhdGlvbi5kYXlzKDE0KSxcbiAgICAgIGVuY3J5cHRpb246IHNxcy5RdWV1ZUVuY3J5cHRpb24uU1FTX01BTkFHRUQsXG4gICAgICBkZWFkTGV0dGVyUXVldWU6IHtcbiAgICAgICAgcXVldWU6IGRscSxcbiAgICAgICAgbWF4UmVjZWl2ZUNvdW50OiAzLCAvLyBSZXRyeSAzIHRpbWVzIGJlZm9yZSBzZW5kaW5nIHRvIERMUVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIER5bmFtb0RCIFRhYmxlIGZvciBlc3NheSBtZXRyaWNzXG4gICAgY29uc3QgbWV0cmljc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdFc3NheU1ldHJpY3MnLCB7XG4gICAgICB0YWJsZU5hbWU6ICdFc3NheU1ldHJpY3MnLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdlc3NheV9pZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULCAvLyBPbi1kZW1hbmQgcHJpY2luZyBmb3IgUG9DXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLCAvLyBGb3IgUG9DIC0gYWxsb3dzIHRhYmxlIGRlbGV0aW9uXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjoge1xuICAgICAgICBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogZmFsc2UsIC8vIENhbiBlbmFibGUgZm9yIHByb2R1Y3Rpb25cbiAgICAgIH0sXG4gICAgICBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQVdTX01BTkFHRUQsXG4gICAgfSk7XG5cbiAgICAvLyBJQU0gUm9sZSBmb3IgQVBJIExhbWJkYSAod2lsbCBiZSB1c2VkIGluIEVwaWMgMilcbiAgICBjb25zdCBhcGlMYW1iZGFSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdBcGlMYW1iZGFSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICBkZXNjcmlwdGlvbjogJ0lBTSByb2xlIGZvciBBUEkgTGFtYmRhIGZ1bmN0aW9uJyxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnKSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBwZXJtaXNzaW9ucyBmb3IgQVBJIExhbWJkYVxuICAgIGVzc2F5c0J1Y2tldC5ncmFudFJlYWRXcml0ZShhcGlMYW1iZGFSb2xlKTtcbiAgICBtZXRyaWNzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGFwaUxhbWJkYVJvbGUpO1xuICAgIHByb2Nlc3NpbmdRdWV1ZS5ncmFudFNlbmRNZXNzYWdlcyhhcGlMYW1iZGFSb2xlKTtcblxuICAgIC8vIElBTSBSb2xlIGZvciBTMyBVcGxvYWQgTGFtYmRhICh3aWxsIGJlIHVzZWQgaW4gRXBpYyAyKVxuICAgIC8vIFRoaXMgTGFtYmRhIHdpbGwgYmUgdHJpZ2dlcmVkIGJ5IFMzIGV2ZW50cyBhbmQgcHVzaCB0byBTUVNcbiAgICBjb25zdCBzM1VwbG9hZExhbWJkYVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1MzVXBsb2FkTGFtYmRhUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgZGVzY3JpcHRpb246ICdJQU0gcm9sZSBmb3IgUzMgdXBsb2FkIHRyaWdnZXIgTGFtYmRhIGZ1bmN0aW9uJyxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnKSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBwZXJtaXNzaW9ucyBmb3IgUzMgVXBsb2FkIExhbWJkYVxuICAgIGVzc2F5c0J1Y2tldC5ncmFudFJlYWQoczNVcGxvYWRMYW1iZGFSb2xlKTtcbiAgICBwcm9jZXNzaW5nUXVldWUuZ3JhbnRTZW5kTWVzc2FnZXMoczNVcGxvYWRMYW1iZGFSb2xlKTtcblxuICAgIC8vIElBTSBSb2xlIGZvciBQcm9jZXNzb3IgTGFtYmRhICh3aWxsIGJlIHVzZWQgaW4gRXBpYyAzKVxuICAgIGNvbnN0IHByb2Nlc3NvckxhbWJkYVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1Byb2Nlc3NvckxhbWJkYVJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnSUFNIHJvbGUgZm9yIGVzc2F5IHByb2Nlc3NvciBMYW1iZGEgZnVuY3Rpb24nLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZScpLFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IHBlcm1pc3Npb25zIGZvciBQcm9jZXNzb3IgTGFtYmRhXG4gICAgZXNzYXlzQnVja2V0LmdyYW50UmVhZChwcm9jZXNzb3JMYW1iZGFSb2xlKTtcbiAgICBtZXRyaWNzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHByb2Nlc3NvckxhbWJkYVJvbGUpO1xuICAgIHByb2Nlc3NpbmdRdWV1ZS5ncmFudENvbnN1bWVNZXNzYWdlcyhwcm9jZXNzb3JMYW1iZGFSb2xlKTtcblxuICAgIC8vIEdyYW50IEJlZHJvY2sgcGVybWlzc2lvbnMgZm9yIFByb2Nlc3NvciBMYW1iZGFcbiAgICBwcm9jZXNzb3JMYW1iZGFSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFsnYmVkcm9jazpJbnZva2VNb2RlbCddLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBgYXJuOmF3czpiZWRyb2NrOiR7dGhpcy5yZWdpb259Ojpmb3VuZGF0aW9uLW1vZGVsL2FudGhyb3BpYy5jbGF1ZGUtMy1zb25uZXQtKmAsXG4gICAgICAgICAgYGFybjphd3M6YmVkcm9jazoke3RoaXMucmVnaW9ufTo6Zm91bmRhdGlvbi1tb2RlbC9hbnRocm9waWMuY2xhdWRlLTMtaGFpa3UtKmAsXG4gICAgICAgICAgYGFybjphd3M6YmVkcm9jazoke3RoaXMucmVnaW9ufTo6Zm91bmRhdGlvbi1tb2RlbC9hbnRocm9waWMuY2xhdWRlLTMtb3B1cy0qYCxcbiAgICAgICAgXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIEFQSSBMYW1iZGEgRnVuY3Rpb25cbiAgICAvLyBTa2lwIGJ1bmRsaW5nIGluIHRlc3QgZW52aXJvbm1lbnQgKERvY2tlciBub3QgYXZhaWxhYmxlKVxuICAgIGNvbnN0IGFwaUxhbWJkYUNvZGUgPSBwcm9jZXNzLmVudi5DREtfU0tJUF9CVU5ETElORyA9PT0gJ3RydWUnXG4gICAgICA/IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhL2FwaScpKVxuICAgICAgOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYS9hcGknKSwge1xuICAgICAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgICAgICBpbWFnZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTIuYnVuZGxpbmdJbWFnZSxcbiAgICAgICAgICAgIGNvbW1hbmQ6IFtcbiAgICAgICAgICAgICAgJ2Jhc2gnLCAnLWMnLFxuICAgICAgICAgICAgICAncGlwIGluc3RhbGwgLXIgcmVxdWlyZW1lbnRzLnR4dCAtdCAvYXNzZXQtb3V0cHV0ICYmIGNwIC1hdSAuIC9hc3NldC1vdXRwdXQnLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICBcbiAgICBjb25zdCBhcGlMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdBcGlMYW1iZGEnLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMixcbiAgICAgIGhhbmRsZXI6ICdsYW1iZGFfZnVuY3Rpb24uaGFuZGxlcicsXG4gICAgICBjb2RlOiBhcGlMYW1iZGFDb2RlLFxuICAgICAgcm9sZTogYXBpTGFtYmRhUm9sZSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEVTU0FZU19CVUNLRVQ6IGVzc2F5c0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICBNRVRSSUNTX1RBQkxFOiBtZXRyaWNzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBQUk9DRVNTSU5HX1FVRVVFX1VSTDogcHJvY2Vzc2luZ1F1ZXVlLnF1ZXVlVXJsLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFMzIFVwbG9hZCBUcmlnZ2VyIExhbWJkYSBGdW5jdGlvblxuICAgIC8vIFNraXAgYnVuZGxpbmcgaW4gdGVzdCBlbnZpcm9ubWVudCAoRG9ja2VyIG5vdCBhdmFpbGFibGUpXG4gICAgY29uc3QgczNVcGxvYWRMYW1iZGFDb2RlID0gcHJvY2Vzcy5lbnYuQ0RLX1NLSVBfQlVORExJTkcgPT09ICd0cnVlJ1xuICAgICAgPyBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYS9zM191cGxvYWRfdHJpZ2dlcicpKVxuICAgICAgOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYS9zM191cGxvYWRfdHJpZ2dlcicpLCB7XG4gICAgICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgICAgIGltYWdlOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMi5idW5kbGluZ0ltYWdlLFxuICAgICAgICAgICAgY29tbWFuZDogW1xuICAgICAgICAgICAgICAnYmFzaCcsICctYycsXG4gICAgICAgICAgICAgICdwaXAgaW5zdGFsbCAtciByZXF1aXJlbWVudHMudHh0IC10IC9hc3NldC1vdXRwdXQgJiYgY3AgLWF1IC4gL2Fzc2V0LW91dHB1dCcsXG4gICAgICAgICAgICBdLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuICAgIFxuICAgIGNvbnN0IHMzVXBsb2FkTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnUzNVcGxvYWRMYW1iZGEnLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMixcbiAgICAgIGhhbmRsZXI6ICdsYW1iZGFfZnVuY3Rpb24uaGFuZGxlcicsXG4gICAgICBjb2RlOiBzM1VwbG9hZExhbWJkYUNvZGUsXG4gICAgICByb2xlOiBzM1VwbG9hZExhbWJkYVJvbGUsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBQUk9DRVNTSU5HX1FVRVVFX1VSTDogcHJvY2Vzc2luZ1F1ZXVlLnF1ZXVlVXJsLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFMzIEV2ZW50IE5vdGlmaWNhdGlvbiAtIHRyaWdnZXIgTGFtYmRhIG9uIG9iamVjdCBjcmVhdGlvblxuICAgIGVzc2F5c0J1Y2tldC5hZGRFdmVudE5vdGlmaWNhdGlvbihcbiAgICAgIHMzLkV2ZW50VHlwZS5PQkpFQ1RfQ1JFQVRFRCxcbiAgICAgIG5ldyBzM24uTGFtYmRhRGVzdGluYXRpb24oczNVcGxvYWRMYW1iZGEpLFxuICAgICAgeyBwcmVmaXg6ICdlc3NheXMvJyB9XG4gICAgKTtcblxuICAgIC8vIEFQSSBHYXRld2F5XG4gICAgY29uc3QgYXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCAnVm9jYWJBcGknLCB7XG4gICAgICByZXN0QXBpTmFtZTogJ1ZvY2FidWxhcnkgRXNzYXkgQW5hbHl6ZXIgQVBJJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIGZvciB2b2NhYnVsYXJ5IGVzc2F5IGFuYWx5c2lzJyxcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xuICAgICAgICBhbGxvd09yaWdpbnM6IGFwaWdhdGV3YXkuQ29ycy5BTExfT1JJR0lOUyxcbiAgICAgICAgYWxsb3dNZXRob2RzOiBhcGlnYXRld2F5LkNvcnMuQUxMX01FVEhPRFMsXG4gICAgICAgIGFsbG93SGVhZGVyczogWydDb250ZW50LVR5cGUnLCAnWC1BbXotRGF0ZScsICdBdXRob3JpemF0aW9uJywgJ1gtQXBpLUtleSddLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIEFQSSBHYXRld2F5IEludGVncmF0aW9uXG4gICAgY29uc3QgYXBpSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihhcGlMYW1iZGEpO1xuXG4gICAgLy8gUE9TVCAvZXNzYXkgZW5kcG9pbnRcbiAgICBjb25zdCBlc3NheVJlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2Vzc2F5Jyk7XG4gICAgZXNzYXlSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBhcGlJbnRlZ3JhdGlvbik7XG5cbiAgICAvLyBHRVQgL2Vzc2F5L3tlc3NheV9pZH0gZW5kcG9pbnRcbiAgICBjb25zdCBlc3NheUlkUmVzb3VyY2UgPSBlc3NheVJlc291cmNlLmFkZFJlc291cmNlKCd7ZXNzYXlfaWR9Jyk7XG4gICAgZXNzYXlJZFJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgYXBpSW50ZWdyYXRpb24pO1xuXG4gICAgLy8gSGVhbHRoIGNoZWNrIGVuZHBvaW50XG4gICAgY29uc3QgaGVhbHRoUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnaGVhbHRoJyk7XG4gICAgaGVhbHRoUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBhcGlJbnRlZ3JhdGlvbik7XG5cbiAgICAvLyBQcm9jZXNzb3IgTGFtYmRhIEZ1bmN0aW9uIChDb250YWluZXIgSW1hZ2UpXG4gICAgLy8gVXNpbmcgY29udGFpbmVyIGltYWdlIGluc3RlYWQgb2YgbGF5ZXIgZHVlIHRvIHNpemUgbGltaXRzIChzcGFDeSArIG1vZGVsID4gMjUwTUIpXG4gICAgY29uc3QgcHJvY2Vzc29yTGFtYmRhID0gbmV3IGxhbWJkYS5Eb2NrZXJJbWFnZUZ1bmN0aW9uKHRoaXMsICdQcm9jZXNzb3JMYW1iZGEnLCB7XG4gICAgICBjb2RlOiBsYW1iZGEuRG9ja2VySW1hZ2VDb2RlLmZyb21JbWFnZUFzc2V0KFxuICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhL3Byb2Nlc3NvcicpLFxuICAgICAgICB7XG4gICAgICAgICAgLy8gRG9ja2VyZmlsZSBpcyBpbiBsYW1iZGEvcHJvY2Vzc29yL0RvY2tlcmZpbGVcbiAgICAgICAgfVxuICAgICAgKSxcbiAgICAgIHJvbGU6IHByb2Nlc3NvckxhbWJkYVJvbGUsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSwgLy8gTXVzdCBtYXRjaCBTUVMgdmlzaWJpbGl0eSB0aW1lb3V0XG4gICAgICBtZW1vcnlTaXplOiAzMDA4LCAvLyBIaWdoIG1lbW9yeSBmb3Igc3BhQ3kgbW9kZWwgbG9hZGluZ1xuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgRVNTQVlTX0JVQ0tFVDogZXNzYXlzQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIE1FVFJJQ1NfVEFCTEU6IG1ldHJpY3NUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIEJFRFJPQ0tfTU9ERUxfSUQ6ICdhbnRocm9waWMuY2xhdWRlLTMtc29ubmV0LTIwMjQwMjI5LXYxOjAnLFxuICAgICAgICAvLyBBV1NfUkVHSU9OIGlzIGF1dG9tYXRpY2FsbHkgc2V0IGJ5IExhbWJkYSBydW50aW1lXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gU1FTIEV2ZW50IFNvdXJjZSBmb3IgUHJvY2Vzc29yIExhbWJkYVxuICAgIHByb2Nlc3NvckxhbWJkYS5hZGRFdmVudFNvdXJjZShcbiAgICAgIG5ldyBsYW1iZGFFdmVudFNvdXJjZXMuU3FzRXZlbnRTb3VyY2UocHJvY2Vzc2luZ1F1ZXVlLCB7XG4gICAgICAgIGJhdGNoU2l6ZTogMSwgLy8gUHJvY2VzcyBvbmUgZXNzYXkgYXQgYSB0aW1lXG4gICAgICAgIG1heEJhdGNoaW5nV2luZG93OiBjZGsuRHVyYXRpb24uc2Vjb25kcygwKSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIENsb3VkRm9ybWF0aW9uIE91dHB1dHNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRXNzYXlzQnVja2V0TmFtZScsIHtcbiAgICAgIHZhbHVlOiBlc3NheXNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUzMgYnVja2V0IG5hbWUgZm9yIGVzc2F5IHN0b3JhZ2UnLFxuICAgICAgZXhwb3J0TmFtZTogJ0Vzc2F5c0J1Y2tldE5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1Byb2Nlc3NpbmdRdWV1ZVVybCcsIHtcbiAgICAgIHZhbHVlOiBwcm9jZXNzaW5nUXVldWUucXVldWVVcmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NRUyBxdWV1ZSBVUkwgZm9yIGVzc2F5IHByb2Nlc3NpbmcnLFxuICAgICAgZXhwb3J0TmFtZTogJ1Byb2Nlc3NpbmdRdWV1ZVVybCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTWV0cmljc1RhYmxlTmFtZScsIHtcbiAgICAgIHZhbHVlOiBtZXRyaWNzVGFibGUudGFibGVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdEeW5hbW9EQiB0YWJsZSBuYW1lIGZvciBlc3NheSBtZXRyaWNzJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdNZXRyaWNzVGFibGVOYW1lJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBcGlMYW1iZGFSb2xlQXJuJywge1xuICAgICAgdmFsdWU6IGFwaUxhbWJkYVJvbGUucm9sZUFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnSUFNIHJvbGUgQVJOIGZvciBBUEkgTGFtYmRhJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdBcGlMYW1iZGFSb2xlQXJuJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTM1VwbG9hZExhbWJkYVJvbGVBcm4nLCB7XG4gICAgICB2YWx1ZTogczNVcGxvYWRMYW1iZGFSb2xlLnJvbGVBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0lBTSByb2xlIEFSTiBmb3IgUzMgdXBsb2FkIHRyaWdnZXIgTGFtYmRhJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdTM1VwbG9hZExhbWJkYVJvbGVBcm4nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1Byb2Nlc3NvckxhbWJkYVJvbGVBcm4nLCB7XG4gICAgICB2YWx1ZTogcHJvY2Vzc29yTGFtYmRhUm9sZS5yb2xlQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdJQU0gcm9sZSBBUk4gZm9yIHByb2Nlc3NvciBMYW1iZGEnLFxuICAgICAgZXhwb3J0TmFtZTogJ1Byb2Nlc3NvckxhbWJkYVJvbGVBcm4nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaVVybCcsIHtcbiAgICAgIHZhbHVlOiBhcGkudXJsLFxuICAgICAgZGVzY3JpcHRpb246ICdBUEkgR2F0ZXdheSBlbmRwb2ludCBVUkwnLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwaVVybCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUHJvY2Vzc29yTGFtYmRhQXJuJywge1xuICAgICAgdmFsdWU6IHByb2Nlc3NvckxhbWJkYS5mdW5jdGlvbkFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnUHJvY2Vzc29yIExhbWJkYSBmdW5jdGlvbiBBUk4nLFxuICAgICAgZXhwb3J0TmFtZTogJ1Byb2Nlc3NvckxhbWJkYUFybicsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==
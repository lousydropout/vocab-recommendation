# Part 2: Update CDK to Use ECR Image

After pushing the image to ECR manually (Part 1), update the CDK stack to reference it.

## Changes Needed in `lib/vocab_recommendation-stack.ts`

Replace the current ProcessorLambda code (around line 206-224):

```typescript
// OLD (builds from local Dockerfile):
const processorLambda = new lambda.DockerImageFunction(this, 'ProcessorLambda', {
  code: lambda.DockerImageCode.fromImageAsset(
    path.join(__dirname, '../lambda/processor'),
    {
      // Dockerfile is in lambda/processor/Dockerfile
    }
  ),
  // ... rest
});
```

With:

```typescript
// NEW (uses pre-pushed ECR image):
import * as ecr from 'aws-cdk-lib/aws-ecr';

// Get reference to the ECR repository
const processorRepo = ecr.Repository.fromRepositoryName(
  this,
  'ProcessorRepo',
  'vocab-processor-lambda'
);

const processorLambda = new lambda.DockerImageFunction(this, 'ProcessorLambda', {
  code: lambda.DockerImageCode.fromEcr(processorRepo, {
    tagOrDigest: 'latest',  // or 'v1'
  }),
  role: processorLambdaRole,
  timeout: cdk.Duration.minutes(5),
  memorySize: 3008,
  environment: {
    ESSAYS_BUCKET: essaysBucket.bucketName,
    METRICS_TABLE: metricsTable.tableName,
    BEDROCK_MODEL_ID: 'anthropic.claude-3-sonnet-20240229-v1:0',
  },
});
```

## Steps

1. Run Part 1 script: `./manual_ecr_push.sh`
2. Update the CDK stack as shown above
3. Run: `npm run build`
4. Deploy: `cdk deploy --require-approval never`

This avoids CDK trying to build/push the image using Docker.




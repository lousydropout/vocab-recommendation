# Manual ECR Push Workaround

## Problem

CDK's Docker integration fails with:
```
docker login --username AWS --password-stdin ... exited with error code 1
```

## Solution: Manual Push to ECR

### Step 1: Build the image locally

```bash
cd lambda/processor
docker build -t vocab-processor-test .
```

**Status**: ✅ Already done (image built successfully)

### Step 2: Push to ECR manually

```bash
./push_to_ecr.sh
```

This script will:
1. Authenticate with ECR using AWS CLI
2. Check/create the ECR repository
3. Tag your local image
4. Push to ECR

### Step 3: Deploy with CDK

After the image is in ECR, run:
```bash
cdk deploy --require-approval never
```

CDK should detect the existing image in ECR and use it.

## Alternative: Use ECR URI directly in CDK

If CDK still tries to build, you can modify the CDK stack to reference the ECR image directly:

```typescript
const processorLambda = new lambda.DockerImageFunction(this, 'ProcessorLambda', {
  code: lambda.DockerImageCode.fromEcr(
    ecr.Repository.fromRepositoryName(this, 'ProcessorRepo', 
      'cdk-hnb659fds-container-assets-971422717446-us-east-1'),
    {
      tagOrDigest: 'processor-lambda'
    }
  ),
  // ... rest of config
});
```

## Why This Works

- AWS CLI authenticates with ECR without using Docker's auth system
- `docker push` works fine (only `docker login` via stdin was failing)
- CDK can use pre-existing images in ECR




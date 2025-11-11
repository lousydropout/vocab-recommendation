# Deployment Checklist - Epic 3

## Pre-Deployment (Completed ✅)

- [x] Docker Desktop working
- [x] ECR authentication successful
- [x] Processor Lambda image built (`vocab-processor-test:latest`)
- [x] TypeScript compiled
- [x] Docker fixed (restarted service, VM now reachable)

## Deployment Command

```bash
cdk deploy --require-approval never
```

## What Gets Deployed

1. **Processor Lambda** (Container Image)
   - Image pushed to ECR
   - Lambda function created with 3008MB memory, 5-minute timeout
   - SQS event source attached
   - Environment variables configured

2. **Stack Updates**
   - Existing API Lambda (no changes)
   - Existing S3 trigger Lambda (no changes)
   - New processor Lambda wired to SQS queue

## Expected Deployment Time

5-10 minutes (image push takes the longest)

## After Deployment - Testing

1. Upload test essay:
   ```bash
   python3 test_api.py
   ```

2. Check essay processing:
   - Check CloudWatch Logs for processor Lambda
   - Query DynamoDB for essay status
   - Verify metrics and feedback are populated

3. Monitor SQS queues:
   - Main queue should be empty
   - DLQ should be empty (no errors)

## Troubleshooting

If deployment fails:
- Check `/tmp/cdk_deploy_final.log` for errors
- Check Docker is still running: `docker ps`
- Check ECR auth: `docker login` to ECR again if needed




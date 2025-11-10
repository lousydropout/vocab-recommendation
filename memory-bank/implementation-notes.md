# Implementation Notes

## Project Structure

```
vocab_recommendation/
├── bin/
│   └── vocab_recommendation.ts          # CDK app entry
├── lib/
│   └── vocab_recommendation-stack.ts   # Main CDK stack ✅
├── test/
│   └── vocab_recommendation.test.ts    # CDK unit tests ✅
├── lambda/
│   ├── api/                             # TODO: Epic 2
│   │   ├── lambda_function.py
│   │   ├── app.py
│   │   └── requirements.txt
│   └── processor/                       # TODO: Epic 3
│       ├── lambda_function.py
│       ├── processor.py
│       └── requirements.txt
├── layers/
│   └── spacy/                           # TODO: Epic 3
│       ├── requirements.txt
│       └── build_layer.sh
├── memory-bank/                         # Project documentation
└── package.json                         # CDK dependencies (TypeScript)
```

## Key Implementation Details

### Lambda Layer for spaCy

1. Build the layer:
   ```bash
   cd layers/spacy
   ./build_layer.sh
   ```
   
2. Layer structure:
   ```
   python/
     lib/
       python3.12/
         site-packages/
           spacy/
           en_core_web_sm/
   ```

3. In Lambda code:
   ```python
   import spacy
   nlp = spacy.load("en_core_web_sm")
   ```

### Bedrock Integration

- **Model ID**: `anthropic.claude-3-sonnet-20240229-v1:0`
- **Region**: Must match stack region
- **IAM Permissions**: `bedrock:InvokeModel` on model ARN
- **API Format**: Bedrock Runtime API with Anthropic message format

### S3 Event Flow

1. Client uploads to S3 (via presigned URL or direct)
2. S3 triggers Lambda on `ObjectCreated` event
3. Lambda extracts `essay_id` from S3 key
4. Lambda sends message to SQS queue
5. Processor Lambda consumes from SQS

### DynamoDB Updates

- Use `update_item` with `UpdateExpression` for atomic updates
- Track status transitions: `awaiting_processing` → `processing` → `processed`
- Store timestamps in ISO8601 format

### Error Handling

- **SQS DLQ**: Failed messages after 3 retries
- **Lambda Timeouts**: Processor Lambda set to 5 minutes
- **Bedrock Errors**: Graceful fallback, log errors
- **spaCy Errors**: Validate input text before processing

## Deployment Checklist

### Epic 1: Infrastructure ✅
1. ✅ Deploy CDK stack: `cdk deploy --require-approval never`
2. ✅ Verify all resources created (S3, DynamoDB, SQS, IAM roles)
3. ✅ Run unit tests: `npm test` (25 tests passing)
4. ✅ Verify CloudFormation outputs exported

### Epic 2: API Layer (TODO)
1. ⏳ Build spaCy Lambda layer
2. ⏳ Create API Lambda with FastAPI
3. ⏳ Create S3 upload trigger Lambda
4. ⏳ Deploy and test API endpoints
5. ⏳ Verify S3 → SQS → Lambda flow

### Epic 3: Processing (TODO)
1. ⏳ Create processor Lambda
2. ⏳ Test Bedrock integration
3. ⏳ Monitor CloudWatch logs

## Common Issues

### spaCy Model Not Found
- **Issue**: `OSError: Can't find model 'en_core_web_sm'`
- **Solution**: Ensure layer is built correctly and attached to Lambda

### Bedrock Access Denied
- **Issue**: `AccessDeniedException` when invoking model
- **Solution**: Check IAM role has `bedrock:InvokeModel` permission

### SQS Message Format
- **Issue**: Processor Lambda can't parse SQS message
- **Solution**: S3 event notification wraps message in `Records` array

### Lambda Timeout
- **Issue**: Processing takes > 5 minutes
- **Solution**: Increase timeout, optimize Bedrock calls (batch if possible)

## Performance Considerations

- **Cold Starts**: spaCy model loading adds ~2-3s to cold start
- **Bedrock Latency**: ~1-2s per word evaluation
- **Cost**: Limit candidate words to ~20 per essay
- **Memory**: Processor Lambda needs 3008MB for spaCy

## Testing Strategy

### CDK Infrastructure Tests ✅
1. ✅ **Unit Tests**: 25 tests covering all CDK resources
   - S3 bucket configuration
   - DynamoDB table schema
   - SQS queues (main + DLQ)
   - IAM roles and policies
   - CloudFormation outputs
   - Resource counts
   - Run with: `npm test`

### Lambda Function Tests (TODO)
1. ⏳ **Unit Tests**: Test processor logic with mock Bedrock responses
2. ⏳ **Integration Tests**: Test full flow with test S3 bucket
3. ⏳ **Load Tests**: Verify < 60s end-to-end latency
4. ⏳ **Error Tests**: Test DLQ, timeout, and error scenarios

## Epic 1 Implementation Details

### Resources Created
- **S3 Bucket**: `vocab-essays-{account}-{region}`
  - Auto-delete on stack deletion
  - S3-managed encryption
  - CORS enabled for web uploads
  - Public access blocked

- **DynamoDB Table**: `EssayMetrics`
  - Partition key: `essay_id` (String)
  - On-demand billing
  - AWS-managed encryption

- **SQS Queues**:
  - `essay-processing-queue`: Main queue, 5min visibility timeout
  - `essay-processing-dlq`: Dead-letter queue, 3 retry attempts

- **IAM Roles**:
  - `ApiLambdaRole`: For API Gateway Lambda (Epic 2)
  - `S3UploadLambdaRole`: For S3 event trigger Lambda (Epic 2)
  - `ProcessorLambdaRole`: For essay processor Lambda (Epic 3)

### Stack Outputs
All resource names and ARNs are exported as CloudFormation outputs for easy reference in subsequent epics.


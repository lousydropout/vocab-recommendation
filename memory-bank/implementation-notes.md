# Implementation Notes

## Project Structure

```
vocab_recommendation/
├── bin/
│   └── vocab_recommendation.ts          # CDK app entry
├── lib/
│   └── vocab_recommendation-stack.ts   # Main CDK stack
├── lambda/
│   ├── api/
│   │   ├── lambda_function.py               # FastAPI handler
│   │   ├── app.py                          # FastAPI app
│   │   └── requirements.txt                # FastAPI, boto3, mangum
│   └── processor/
│       ├── lambda_function.py              # Processing handler
│       ├── processor.py                    # spaCy + Bedrock logic
│       └── requirements.txt                # boto3
├── layers/
│   └── spacy/
│       ├── requirements.txt                # spacy, en_core_web_sm
│       └── build_layer.sh                  # Script to build layer
├── memory-bank/                            # Project documentation
└── package.json                            # CDK dependencies (TypeScript)
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

1. ✅ Build spaCy Lambda layer
2. ✅ Deploy CDK stack: `cdk deploy`
3. ✅ Test API endpoints
4. ✅ Verify S3 → SQS → Lambda flow
5. ✅ Test Bedrock integration
6. ✅ Monitor CloudWatch logs

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

1. **Unit Tests**: Test processor logic with mock Bedrock responses
2. **Integration Tests**: Test full flow with test S3 bucket
3. **Load Tests**: Verify < 60s end-to-end latency
4. **Error Tests**: Test DLQ, timeout, and error scenarios


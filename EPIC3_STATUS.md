# Epic 3: Processing Pipeline - Implementation Status

## ✅ Completed

### 1. Processor Lambda Function
- **Location**: `lambda/processor/lambda_function.py`
- **Features**:
  - SQS message consumption
  - S3 essay download
  - spaCy analysis (lexical metrics, POS distribution, frequency rank)
  - Candidate word selection (low-frequency, unusual POS, longer words)
  - Bedrock integration for word-level evaluation
  - DynamoDB update with metrics and feedback

### 2. CDK Stack Updates
- Added processor Lambda function
- Added spaCy Lambda layer configuration
- Configured SQS event source mapping
- Set Lambda timeout (5 minutes) and memory (3008MB)
- Added environment variables (bucket, table, Bedrock model ID)

### 3. Build Scripts
- `build_spacy_layer.sh` - Builds spaCy layer using Docker
- `setup_venv.sh` - Sets up Python virtual environment (optional, for local dev)

### 4. Dependencies
- `lambda/processor/requirements.txt` - boto3, spacy

## ⏳ Pending

### 1. Build spaCy Layer
**Before deployment**, you must build the spaCy Lambda layer:

```bash
./build_spacy_layer.sh
```

This creates the `layer/` directory with spaCy and the `en_core_web_sm` model.

### 2. Deploy Stack
```bash
npm run build
cdk deploy --require-approval never
```

### 3. Test End-to-End Flow
1. Upload essay via API (POST /essay)
2. Verify S3 → SQS → Processor Lambda flow
3. Check DynamoDB for processed results
4. Retrieve results via GET /essay/{essay_id}

## Implementation Details

### Processor Lambda Flow
1. **SQS Event**: Receives message with `{essay_id, file_key}`
2. **Status Update**: Sets DynamoDB status to `processing`
3. **Download**: Fetches essay text from S3
4. **spaCy Analysis**: Computes:
   - Word count, unique words, type-token ratio
   - POS distribution (noun, verb, adj, adv ratios)
   - Average word frequency rank
5. **Candidate Selection**: Selects top 20 words for evaluation
6. **Bedrock Evaluation**: Calls Claude 3 for each candidate word
7. **Update**: Saves metrics and feedback to DynamoDB (status: `processed`)

### Bedrock Integration
- **Model**: `anthropic.claude-3-sonnet-20240229-v1:0`
- **Format**: Anthropic message format via Bedrock Runtime API
- **Response**: JSON with `{correct: bool, comment: string}`

### Error Handling
- Failed Bedrock calls return fallback evaluation
- Exceptions trigger SQS retry (up to 3 times, then DLQ)
- Lambda timeout matches SQS visibility timeout (5 minutes)

## Notes

- **Memory**: Processor Lambda uses 3008MB for spaCy model loading
- **Timeout**: 5 minutes (must match SQS visibility timeout)
- **Batch Size**: 1 essay per Lambda invocation
- **Layer**: spaCy model loaded from Lambda layer (reduces package size)




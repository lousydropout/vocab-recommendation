# Requirements

## Product Requirements Document Summary

### Objectives

1. **Demonstrate full serverless workflow**
   - Success Metric: End-to-end latency < 60s

2. **Validate NLP + LLM pairing**
   - Success Metric: ≥ 90% processing success rate

3. **Deliver interpretable results**
   - Success Metric: JSON schema verified, no crashes

4. **Enable future scalability**
   - Success Metric: Components modular and AWS-native

## Functional Requirements

### In Scope

- Upload and analyze **one** typed essay per request
- Compute lexical metrics via **spaCy en_core_web_sm**:
  - Word count, unique words, type-token ratio
  - Part-of-speech ratios (noun, verb, etc.)
  - Average word frequency rank
- Evaluate word-in-context correctness and formality via **AWS Bedrock LLM**
- Store results and status in **DynamoDB**
- Retrieve full report via GET API
- Deployment entirely on AWS
- **Plain text input only** (no file parsing)

### Out of Scope

- Multi-user authentication or role management
- Batch uploads, scheduling, or cohort analytics
- UI beyond a basic upload/view front-end (Note: Frontend is in Epic 4)
- Real-time speech or handwriting inputs
- Model training or fine-tuning

## Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| **Performance** | Process ≤ 100 essays/day with ≤ 60s average latency |
| **Reliability** | ≥ 95% successful Lambda executions |
| **Scalability** | Serverless auto-scaling; no manual infra ops |
| **Security** | Data isolated in AWS region; access via IAM roles only |
| **Cost Target** | ≤ $0.10 per essay end-to-end processing cost |

## User Flow

1. **POST /essay**
   - Upload essay text (or presigned URL metadata)
   - Returns `essay_id`

2. **S3 → SQS → Processing Lambda**
   - Retrieves file, runs spaCy + Bedrock analysis
   - Updates DynamoDB record with `status="processed"` and results

3. **GET /essay/{essay_id}**
   - Returns JSON report with metrics and feedback


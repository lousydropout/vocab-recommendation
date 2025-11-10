# Architecture

## System Overview

The Vocabulary Essay Analyzer PoC is a serverless AWS application that processes student essays to evaluate vocabulary diversity, difficulty, and contextual correctness.

## Architecture Flow

```
1. Client → POST /essay → API Lambda
   - Creates DynamoDB record (status: awaiting_processing)
   - Uploads essay to S3 (or returns presigned URL)
   
2. S3 Object Created → S3 Upload Lambda
   - Triggered by S3 event notification
   - Pushes message to SQS queue
   
3. SQS Message → Processor Lambda
   - Downloads essay from S3
   - Runs spaCy analysis (lexical metrics)
   - Calls Bedrock (Claude 3) for word-level feedback
   - Updates DynamoDB with results (status: processed)
   
4. Client → GET /essay/{essay_id} → API Lambda
   - Queries DynamoDB
   - Returns status, metrics, and feedback
```

## AWS Components

| Component | Service | Purpose |
|-----------|---------|---------|
| API Layer | API Gateway + Lambda (Python/FastAPI) | Handle HTTP requests |
| Storage | S3 | Store essay files |
| Queue | SQS | Async processing trigger |
| Processing | Lambda (Python) | spaCy + Bedrock analysis |
| Database | DynamoDB | Store essay status and results |
| NLP Model | Lambda Layer | spaCy + en_core_web_sm |
| LLM | Bedrock (Claude 3) | Word-level evaluation |

## Technology Stack

- **Infrastructure**: AWS CDK (TypeScript)
- **API**: FastAPI + Mangum (Python)
- **NLP**: spaCy (en_core_web_sm)
- **LLM**: AWS Bedrock (Claude 3 Sonnet)
- **Storage**: S3, DynamoDB
- **Queue**: SQS
- **Frontend**: React + Tailwind + shadcn/ui (Vercel)

## Key Design Decisions

1. **Lambda Layers for spaCy**: Reduces deployment package size, enables reuse
2. **SQS for async processing**: Decouples API from processing, enables retry logic
3. **DynamoDB for state**: Fast lookups, serverless scaling
4. **Presigned URLs**: Allows direct client-to-S3 upload, reduces Lambda costs
5. **Python for Lambdas**: Better NLP library support (spaCy)


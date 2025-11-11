# Architecture

## System Overview

The Vocabulary Essay Analyzer PoC is a serverless AWS application that processes student essays to evaluate vocabulary diversity, difficulty, and contextual correctness.

## Architecture Flow

### Phase 1: PoC Flow (Epics 1-5) - COMPLETE

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

### Phase 2: Multi-Essay Teaching Platform Flow (Epics 6-8) - IN PROGRESS

```
Teacher (Frontend)
   ↓
Login (Cognito)
   ↓ JWT
API Gateway (Cognito Authorizer)
   ↓
API Lambda
   ↳ DynamoDB (Teachers, Students, Assignments, EssayMetrics)
   ↳ S3 Uploads (Batch Essay)
   ↳ SQS Queue (Processor)
Processor Lambda
   ↳ Updates EssayMetrics + Aggregation Lambdas
Aggregation Lambdas
   ↳ ClassMetrics / StudentMetrics tables
Frontend Dashboards (React)
```

## AWS Components

### Phase 1: PoC Components (Epics 1-5) - COMPLETE

| Component | Service | Purpose |
|-----------|---------|---------|
| API Layer | API Gateway + Lambda (Python/FastAPI) | Handle HTTP requests |
| Storage | S3 | Store essay files |
| Queue | SQS | Async processing trigger |
| Processing | Lambda (Python) | spaCy + Bedrock analysis |
| Database | DynamoDB | Store essay status and results |
| NLP Model | Docker Container | spaCy + en_core_web_sm |
| LLM | Bedrock (Claude 3) | Word-level evaluation |

### Phase 2: Multi-Essay Teaching Platform Components (Epics 6-8) - IN PROGRESS

| Component | Service | Purpose |
|-----------|---------|---------|
| Authentication | Cognito User Pool | Teacher login and JWT tokens |
| Authorization | API Gateway Authorizer | JWT validation for all routes |
| Teacher Management | DynamoDB (Teachers table) | Teacher profiles and metadata |
| Student Management | DynamoDB (Students table) | Student profiles linked to teachers |
| Assignment Management | DynamoDB (Assignments table) | Assignment metadata and organization |
| Analytics | DynamoDB (ClassMetrics, StudentMetrics) | Pre-computed aggregate metrics |
| Aggregation | Lambda (Python) | Compute class and student-level metrics |
| Override Queue | SQS (EssayUpdateQueue) | Decouple metric re-computation from API |

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


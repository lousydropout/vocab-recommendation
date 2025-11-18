# Architecture

## System Overview

The Vocabulary Essay Analyzer is a fully serverless AWS application that processes student essays asynchronously to evaluate vocabulary diversity and provide educational feedback using OpenAI GPT-4.1-mini.

## Current Architecture Flow (Simplified Async - 2025-01-XX)

```
1. Teacher (Frontend) → POST /essays/batch → API Lambda
   - Accepts multiple essays: { assignment_id, student_id?, essays: [{ filename, text }] }
   - Creates DynamoDB records in Essays table (status: "pending")
   - Enqueues SQS messages (ONLY IDs: teacher_id, assignment_id, student_id, essay_id)
   - Returns immediately: [{ essay_id, status: "pending" }, ...]

2. SQS Message → Worker Lambda (SQS Event Source)
   - Triggered automatically by SQS
   - Loads essay_text from DynamoDB (not from SQS message)
   - Calls OpenAI GPT-4.1-mini for vocabulary analysis
   - Updates DynamoDB: vocabulary_analysis, status: "processed", processed_at
   - SQS auto-deletes message on success
   - DLQ after 3 retries

3. Frontend → GET /essays/{essay_id} → API Lambda
   - Queries Essays table
   - Returns: essay_id, assignment_id, student_id, status, vocabulary_analysis, created_at, processed_at
   - Frontend polls every 2-3 seconds until status === "processed"
```

## AWS Components

### Current Components (Simplified Architecture)

| Component      | Service                                            | Purpose                                 |
| -------------- | -------------------------------------------------- | --------------------------------------- |
| API Layer      | API Gateway + Lambda (Python/FastAPI)              | Handle HTTP requests, batch uploads     |
| Queue          | SQS (EssayProcessingQueue + DLQ)                   | Async processing trigger                |
| Processing     | Lambda (Python Worker)                             | OpenAI GPT-4.1-mini analysis            |
| Database       | DynamoDB (Essays, Students, Assignments, Teachers) | Store essay data and metadata           |
| LLM            | OpenAI GPT-4.1-mini                                | Vocabulary analysis and recommendations |
| Authentication | Cognito User Pool                                  | Teacher login and JWT tokens            |
| Authorization  | API Gateway Authorizer                             | JWT validation for protected routes     |

### Removed Components (Legacy Architecture)

- ❌ **ECS Fargate**: Removed - processing now handled by Worker Lambda
- ❌ **S3 Upload Trigger Lambda**: Removed - no S3-based uploads
- ❌ **Aggregation Lambdas**: Removed - metrics computed on-demand
- ❌ **EssayUpdateQueue**: Removed - no metric re-computation needed
- ❌ **Metrics Tables**: Removed (EssayMetrics, ClassMetrics, StudentMetrics) - replaced by Essays table
- ❌ **spaCy**: Removed - replaced by OpenAI analysis
- ❌ **Bedrock**: Removed - replaced by OpenAI

## AWS Components

### Phase 1: PoC Components (Epics 1-5) - COMPLETE

| Component  | Service                               | Purpose                                                                 |
| ---------- | ------------------------------------- | ----------------------------------------------------------------------- |
| API Layer  | API Gateway + Lambda (Python/FastAPI) | Handle HTTP requests                                                    |
| Storage    | S3                                    | Store essay files                                                       |
| Queue      | SQS                                   | Async processing trigger                                                |
| Processing | ECS Fargate (Python Worker)           | spaCy + Bedrock analysis (migrated from Lambda due to 250MB size limit) |
| Database   | DynamoDB                              | Store essay status and results                                          |
| NLP Model  | Docker Container                      | spaCy + en_core_web_sm                                                  |
| LLM        | Bedrock (Claude 3)                    | Word-level evaluation                                                   |

### Phase 2: Multi-Essay Teaching Platform Components (Epics 6-8) - IN PROGRESS

| Component             | Service                                 | Purpose                                 |
| --------------------- | --------------------------------------- | --------------------------------------- |
| Authentication        | Cognito User Pool                       | Teacher login and JWT tokens            |
| Authorization         | API Gateway Authorizer                  | JWT validation for all routes           |
| Teacher Management    | DynamoDB (Teachers table)               | Teacher profiles and metadata           |
| Student Management    | DynamoDB (Students table)               | Student profiles linked to teachers     |
| Assignment Management | DynamoDB (Assignments table)            | Assignment metadata and organization    |
| Analytics             | DynamoDB (ClassMetrics, StudentMetrics) | Pre-computed aggregate metrics          |
| Aggregation           | Lambda (Python)                         | Compute class and student-level metrics |
| Override Queue        | SQS (EssayUpdateQueue)                  | Decouple metric re-computation from API |

## Technology Stack

- **Infrastructure**: AWS CDK (TypeScript)
- **API**: FastAPI + Mangum (Python)
- **LLM**: OpenAI GPT-4.1-mini
- **Storage**: DynamoDB (Essays, Students, Assignments, Teachers tables)
- **Queue**: SQS (EssayProcessingQueue + DLQ)
- **Frontend**: React + TanStack Router + TanStack Query + Tailwind + shadcn/ui
- **Build**: Bun

## Key Design Decisions

1. **Fully Async Architecture**: All essay processing is asynchronous via SQS - no synchronous OpenAI calls
2. **Worker Lambda**: Single Lambda function processes all essays, triggered by SQS events
3. **No essay_text in SQS**: SQS messages contain only IDs - Worker Lambda loads essay_text from DynamoDB (prevents 256KB SQS limit issues)
4. **Simplified Schema**: Single Essays table replaces multiple metrics tables - vocabulary_analysis stored directly
5. **Batch Upload**: Single endpoint accepts multiple essays for efficient processing
6. **No ECS**: Removed ECS Fargate - Worker Lambda handles all processing (no size limits with OpenAI API)
7. **No S3 Triggers**: Direct API uploads - no S3 event processing needed
8. **On-Demand Metrics**: Metrics computed on-demand from Essays table (no pre-computed aggregation tables)

# Task List — Vocabulary Essay Analyzer (PoC)

## 🧭 **Epic 1: Infrastructure Setup (AWS CDK)** ✅ **COMPLETE**

**Goal:** Define and deploy all core AWS resources.

### Tasks

1. ✅ **Initialize CDK project**
   - `cdk init app --language typescript` - Done
   - Add `.env` for stack config (region, account) - Done (uses env vars with fallback)

2. ✅ **Create S3 bucket** for essay uploads
   - Created `EssaysBucket` with auto-delete, encryption, CORS
   - Event notifications will be configured in Epic 2 when Lambda is created

3. ✅ **Create SQS queue** `EssayProcessingQueue`
   - Created with DLQ (3 retry attempts)
   - 5-minute visibility timeout
   - 14-day message retention
   - SQS-managed encryption

4. ✅ **Create DynamoDB table** `EssayMetrics`
   - Partition key: `essay_id` (String)
   - On-demand billing mode
   - AWS-managed encryption
   - Point-in-time recovery disabled (for PoC)

5. ✅ **Create IAM roles/policies**
   - **ApiLambdaRole**: S3 read/write, DynamoDB read/write, SQS send
   - **S3UploadLambdaRole**: S3 read, SQS send
   - **ProcessorLambdaRole**: S3 read, DynamoDB read/write, SQS consume, Bedrock invoke (Claude 3 models)
   - All roles have CloudWatch Logs permissions

6. ✅ **Deploy CDK stack** and test resource creation.
   - Stack deployed successfully to `us-east-1`
   - All resources created and verified
   - CloudFormation outputs exported

7. ✅ **Unit Tests**
   - Added 25 comprehensive unit tests
   - All tests passing
   - Tests cover: S3, DynamoDB, SQS, IAM roles/policies, CloudFormation outputs

---

## 🧮 **Epic 2: API Layer (FastAPI + Mangum)** ✅ **COMPLETE**

**Goal:** Expose upload and retrieval endpoints.

### Tasks

1. ✅ **Create Lambda with FastAPI + Mangum handler.**
   - Created API Lambda with FastAPI application
   - Configured Mangum adapter for Lambda
   - Added CORS middleware
   - Health check endpoint implemented

2. ✅ **Implement `/essay (POST)`**
   - Accepts `essay_text` for direct upload OR `request_presigned_url` for presigned URL
   - Generates `essay_id` (UUID)
   - Uploads file directly to S3 if `essay_text` provided
   - Generates presigned URL if requested or if no text provided
   - Inserts record in DynamoDB with status `awaiting_processing`
   - Returns `essay_id`, `status`, and optional `presigned_url`

3. ✅ **Implement `/essay/{essay_id} (GET)`**
   - Queries DynamoDB for essay record
   - Returns status, metrics, feedback JSON
   - Handles 404 for non-existent essays

4. ✅ **Create S3 Upload Trigger Lambda**
   - Processes S3 `ObjectCreated` events
   - Extracts `essay_id` from S3 key
   - Sends message to SQS queue for processing
   - Filters only files in `essays/` prefix

5. ✅ **Configure API Gateway**
   - Created REST API with CORS support
   - Integrated Lambda functions
   - Configured endpoints: POST /essay, GET /essay/{essay_id}, GET /health

6. ✅ **Set up S3 Event Notifications**
   - Configured S3 bucket to trigger Lambda on object creation
   - Filtered to `essays/` prefix only

7. ✅ **Deploy and Test**
   - Stack deployed successfully
   - All API endpoints tested and working
   - Created comprehensive test script (`test_api.py`)
   - All 6 API integration tests passing

---

## 🧠 **Epic 3: Processing Pipeline (spaCy + Bedrock)** ✅ **COMPLETE**

**Goal:** Automatically process essays and populate results.

### Tasks

1. ✅ **Lambda (SQS Consumer)**
   - Triggered by new message in `EssayProcessingQueue`.
   - Implemented in `lambda/processor/lambda_function.py`
   - SQS event source configured in CDK stack
   - Batch size: 1, timeout: 5 minutes

2. ✅ **Download essay from S3**
   - Implemented S3 download logic in processor Lambda
   - Extracts essay_id and file_key from SQS message

3. ✅ **Run spaCy (`en_core_web_sm`)**
   - Implemented in `lambda/processor/processor.py`
   - Computes:
     * `word_count`, `unique_words`, `type_token_ratio`
     * POS distribution (`noun_ratio`, `verb_ratio`, etc.)
     * Average frequency rank (placeholder implementation)
   - Docker container includes spaCy 3.8.8 and en_core_web_sm model

4. ✅ **Select candidate words for evaluation**
   - Implemented `get_candidate_words()` function
   - Selects longer words (>6 chars) and non-stop words
   - Limits to top 10 candidates for LLM evaluation

5. ✅ **Call Bedrock model** for each candidate:
   - Implemented `evaluate_word_with_bedrock()` function
   - Uses Claude 3 Sonnet (`anthropic.claude-3-sonnet-20240229-v1:0`)
   - Prompt: "Is this word used correctly in this sentence? Rate correctness and formality."
   - Collects JSON responses with correctness and formality ratings

6. ✅ **Aggregate results**
   - Implemented in `process_essay()` function
   - Composes `metrics` and `feedback` sections
   - Formats feedback as list of word evaluations

7. ✅ **Update DynamoDB record**
   - Updates status: `awaiting_processing` → `processing` → `processed`
   - Stores computed metrics and feedback JSON
   - Updates `updated_at` timestamp

**Deployment Notes:**
- Used Docker container image instead of Lambda layer (size > 250MB limit)
- Dockerfile in `lambda/processor/Dockerfile`
- Base image: `public.ecr.aws/lambda/python:3.12`
- Memory: 3008 MB, Timeout: 5 minutes
- Successfully deployed via CDK (builds and pushes to ECR automatically)
- Processor Lambda ARN: `arn:aws:lambda:us-east-1:971422717446:function:VocabRecommendationStack-ProcessorLambda71A929CE-ozi1g6dgvdXT`

**Bugs Fixed During Testing:**
1. ✅ **DynamoDB Float Type Error**: Added `convert_floats_to_decimal()` function to recursively convert all float values to Decimal for DynamoDB compatibility
2. ✅ **Reserved Keyword Error**: Updated `update_dynamodb()` to use ExpressionAttributeNames for "metrics" and "feedback" (reserved keywords)

**Testing:**
- ✅ Created end-to-end test script (`test_processing.py`)
- ✅ Test validates: upload → processing → metrics → feedback → DynamoDB storage
- ✅ All validations passing
- ✅ Typical processing time: ~37 seconds for 85-word essay with 20 candidate words

---

## 🔍 **Epic 4: Frontend (React + Tailwind + shadcn/ui)**

**Goal:** Provide a minimal web UI.

### Tasks

1. Build simple page with:
   * File upload → POST to `/essay`
   * "Processing…" indicator
   * Report view (poll `/essay/{id}` until `status=processed`)

2. Render metrics summary and feedback list.

---

## 📊 **Epic 5: Observability**

**Goal:** Basic monitoring and logging.

### Tasks

1. Enable **CloudWatch Logs** for all Lambdas.

2. Add simple `print()` logs for:
   * Upload received
   * Processing start/completion
   * Errors from Bedrock or spaCy

3. (Optional) Set CloudWatch alarm for failed Lambdas > threshold.

---

# **DynamoDB Schema — `EssayMetrics` Table**

| Attribute       | Type                | Key                    | Description                                        |
| --------------- | ------------------- | ---------------------- | -------------------------------------------------- |
| `essay_id`      | `String`            | **Partition Key (PK)** | Unique UUID per essay                              |
| `status`      | `String`            |                        | `awaiting_processing` / `processing` / `processed` |
| `file_key`      | `String`            |                        | S3 object path                                     |
| `metrics`       | `Map`               |                        | Lexical stats from spaCy                           |
| `feedback`      | `List<Map>`         |                        | Bedrock word-level evaluations                     |
| `created_at`    | `String (ISO8601)`  |                        | Upload timestamp                                   |
| `updated_at`    | `String (ISO8601)`  |                        | Last update                                        |
| `student_id`    | `String` (optional) |                        | Future expansion — group essays by student         |
| `grade`         | `Number` (optional) |                        | Grade-level grouping                               |
| `assignment_id` | `String` (optional) |                        | Multi-essay expansion                              |
| `model_version` | `String` (optional) |                        | Track spaCy/Bedrock versions used                  |

### Example Record

```json
{
  "essay_id": "essay_2025_0001",
  "status": "processed",
  "file_key": "essays/essay_2025_0001.txt",
  "metrics": {
    "word_count": 478,
    "unique_words": 212,
    "type_token_ratio": 0.44,
    "noun_ratio": 0.29,
    "verb_ratio": 0.21,
    "avg_word_freq_rank": 1750
  },
  "feedback": [
    {"word": "articulated", "correct": false, "comment": "Used incorrectly; too formal"},
    {"word": "rapidly", "correct": true}
  ],
  "created_at": "2025-11-10T17:31:00Z",
  "updated_at": "2025-11-10T17:32:30Z"
}
```

---

# **Optional Future Tables**

| Table           | Purpose                                                     | Notes             |
| --------------- | ----------------------------------------------------------- | ----------------- |
| `CohortMetrics` | Stores aggregated grade-level or assignment-level baselines | Key: `grade`      |
| `Students`      | Optional user index if you expand beyond PoC                | Key: `student_id` |

---

## Notes

- **Input Format**: Plain text input only for now
- **Processing Flow**: S3 upload → Lambda → SQS → Processor Lambda
- **Status Tracking**: `awaiting_processing` → `processing` → `processed`


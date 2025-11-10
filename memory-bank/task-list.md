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

## 🧮 **Epic 2: API Layer (FastAPI + Mangum)**

**Goal:** Expose upload and retrieval endpoints.

### Tasks

1. **Create Lambda with FastAPI + Mangum handler.**

2. **Implement `/essay (POST)`**
   - Accept metadata + file (or pre-signed URL request).
   - Generate `essay_id` (UUID).
   - Upload file to S3 or return pre-signed URL.
   - Insert record in DynamoDB:
     ```json
     {
       "essay_id": "...",
       "status": "awaiting_processing",
       "file_key": "...",
       "created_at": "...",
       "updated_at": "..."
     }
     ```
   - Push SQS message `{ "essay_id": "...", "file_key": "..." }`.
   - Return `essay_id` in response.

3. **Implement `/essay/{essay_id} (GET)`**
   - Query DynamoDB for essay record.
   - Return status, metrics, feedback JSON.

---

## 🧠 **Epic 3: Processing Pipeline (spaCy + Bedrock)**

**Goal:** Automatically process essays and populate results.

### Tasks

1. **Lambda (SQS Consumer)**
   - Triggered by new message in `EssayProcessingQueue`.

2. **Download essay from S3**.

3. **Run spaCy (`en_core_web_sm`)**
   - Compute:
     * `word_count`, `unique_words`, `type_token_ratio`
     * POS distribution (`noun_ratio`, `verb_ratio`, etc.)
     * Average frequency rank (using SUBTLEX/COCA table)

4. **Select candidate words for evaluation**
   - Low-frequency or unusual POS usage.

5. **Call Bedrock model** for each candidate:
   - Prompt: "Is this word used correctly in this sentence? Rate correctness and formality."
   - Collect JSON responses.

6. **Aggregate results**
   - Compose `metrics` and `feedback` sections.

7. **Update DynamoDB record**
   - Set `status = processed`
   - Store computed metrics and feedback JSON.

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


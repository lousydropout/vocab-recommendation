# Requirements

## Product Requirements Document Summary

### Phase 1: PoC (Epics 1-5) - COMPLETE

**Objectives:**

1. **Demonstrate full serverless workflow**
   - Success Metric: End-to-end latency < 60s ✅

2. **Validate NLP + LLM pairing**
   - Success Metric: ≥ 90% processing success rate ✅

3. **Deliver interpretable results**
   - Success Metric: JSON schema verified, no crashes ✅

4. **Enable future scalability**
   - Success Metric: Components modular and AWS-native ✅

### Phase 2: Multi-Essay Teaching Platform (Epics 6-8) - IN PROGRESS

**New Goals:**

1. **Authentication & Authorization**
   - Secure teacher login using AWS Cognito (or custom JWT authorizer)
   - Restrict all APIs to authenticated teachers

2. **Teacher & Student Management**
   - CRUD endpoints for teacher and student profiles
   - Students linked to teachers

3. **Assignments & Batch Upload**
   - Allow teachers to upload multiple essays for an assignment
   - Lambda parses each essay, extracts student names, creates student entries if missing

4. **Analytics & Dashboards**
   - Compute aggregate metrics per assignment and per student over time
   - Store summaries in new DynamoDB tables for quick retrieval

5. **Teacher Review & Override**
   - Teachers can view essay feedback and override AI evaluations
   - Overrides update stored feedback and trigger metric recalculation

## Functional Requirements

### Phase 1: PoC (Epics 1-5) - COMPLETE

**In Scope:**
- Upload and analyze **one** typed essay per request
- Compute lexical metrics via **spaCy en_core_web_sm**
- Evaluate word-in-context correctness and formality via **AWS Bedrock LLM**
- Store results and status in **DynamoDB**
- Retrieve full report via GET API
- Deployment entirely on AWS
- **Plain text input only** (no file parsing)

**Out of Scope (Phase 1):**
- Multi-user authentication or role management
- Batch uploads, scheduling, or cohort analytics
- UI beyond a basic upload/view front-end
- Real-time speech or handwriting inputs
- Model training or fine-tuning

### Phase 2: Multi-Essay Teaching Platform (Epics 6-8) - IN PROGRESS

**In Scope:**
- **Epic 6:** AWS Cognito authentication, teacher management, JWT-protected APIs
- **Epic 7:** Student CRUD, assignment management, batch essay uploads, automatic student name extraction
- **Epic 8:** Class-level and student-level analytics dashboards, teacher feedback override functionality

**Out of Scope (Phase 2):**
- Student self-service accounts
- Real-time collaboration features
- Mobile applications
- Advanced ML model training

## Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| **Performance** | Process ≤ 100 essays/day with ≤ 60s average latency |
| **Reliability** | ≥ 95% successful Lambda executions |
| **Scalability** | Serverless auto-scaling; no manual infra ops |
| **Security** | JWT validation for all API routes; teacher isolation via `teacher_id` namespacing |
| **Cost Target** | ≤ $0.10 per essay end-to-end processing cost |

## User Flow

### Phase 1: PoC Flow (COMPLETE)

1. **POST /essay**
   - Upload essay text (or presigned URL metadata)
   - Returns `essay_id`

2. **S3 → SQS → Processing Lambda**
   - Retrieves file, runs spaCy + Bedrock analysis
   - Updates DynamoDB record with `status="processed"` and results

3. **GET /essay/{essay_id}**
   - Returns JSON report with metrics and feedback

### Phase 2: Multi-Essay Teaching Platform Flow (IN PROGRESS)

1. **Teacher Login** (Epic 6)
   - Teacher authenticates via Cognito
   - Receives JWT token
   - Token stored in localStorage

2. **Create Assignment & Upload Essays** (Epic 7)
   - Teacher creates assignment
   - Uploads multiple essays (batch)
   - System extracts student names, creates student records
   - Essays processed via existing pipeline

3. **View Analytics** (Epic 8)
   - Teacher views class-level metrics per assignment
   - Teacher views student-level progress over time
   - Teacher reviews individual essay feedback

4. **Override Feedback** (Epic 8)
   - Teacher toggles word-level feedback (correct/incorrect)
   - System updates EssayMetrics and recalculates aggregates


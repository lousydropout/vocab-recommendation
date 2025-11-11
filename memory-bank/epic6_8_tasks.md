# Epic 6 — Authentication & Teacher Management

**Goal:** Add secure teacher login via Cognito; protect all APIs with JWT; plumb `teacher_id` through every request.

## 6.1 CDK — Cognito + Authorizer

**Do**

1. Create Cognito User Pool + App Client + Domain.

2. Create API Gateway Cognito Authorizer wired to existing REST API.

3. Output User Pool ID, Client ID, Region.

**Files**

* `lib/vocab_stack.ts` (add Cognito resources, authorizer)

* `bin/cdk.json` (ensure context/env)

**CLI**

```bash

cdk diff && cdk deploy

```

**Acceptance**

* `cdk outputs` includes:

  * `CognitoUserPoolId`

  * `CognitoUserPoolClientId`

  * `CognitoRegion`

* API Gateway shows authorizer attached to `/essay*`, `/students*`, `/assignments*`, `/metrics*`.

## 6.2 Backend — JWT Validation Middleware

**Do**

1. Add a FastAPI dependency that extracts and validates JWT (via `python-jose` or AWS JWT verifier) and injects `teacher_id` (sub/username).

2. Wrap all protected routes to require `teacher_ctx: TeacherContext`.

**Files**

* `lambda/api/app/auth.py` (JWT verifier)

* `lambda/api/app/deps.py` (teacher context dependency)

* Refactor route handlers to use `teacher_ctx.teacher_id`.

**Acceptance**

* Unauthed request → `401`.

* Authed request with real Cognito token → `200`.

## 6.3 Backend — Teachers Table (metadata)

**Do**

1. Add DynamoDB **Teachers** table (PK: `teacher_id`).

2. Add on-login "ensure teacher record" path (either via `/auth/health` or on first write).

**Files**

* `lib/vocab_stack.ts` (DDB table)

* `lambda/api/app/db/teachers.py` (get_or_create)

* `lambda/api/app/routes/auth.py` (`GET /auth/health`)

**Acceptance**

* Call `/auth/health` with valid token → returns `{ teacher_id, email }` and persists a row if missing.

**CLI**

```bash

pytest -q lambda/api/tests/test_auth.py

```

## 6.4 Frontend — Login/Logout + Token Plumb

**Do**

1. Add login flow using Cognito Hosted UI **or** custom username/password (if using SRP, skip Hosted UI).

2. Store `idToken` in `localStorage`.

3. Axios interceptor attaches `Authorization: Bearer <token>`.

**Files**

* `frontend/src/lib/auth.ts`

* `frontend/src/api/client.ts`

* `frontend/src/pages/Login.tsx`

* Route guard/HOC to protect app routes.

**Acceptance**

* Visiting `/` when logged out redirects to `/login`.

* After login, API calls include `Authorization` header.

## 6.5 Tests (CI)

**Do**

* Unit: token parsing, context injection.

* Integration: 401/403/200 flows.

**Files**

* `lambda/api/tests/test_jwt.py`

* `frontend/src/__tests__/auth.test.tsx`

**Acceptance**

* All tests pass locally and in CI.

---

# Epic 7 — Student & Assignment Management + Batch Upload

**Goal:** CRUD for students/assignments; batch upload essays (zip or multi-part), auto-parse student names, create missing students, enqueue processing.

## 7.1 CDK — New Tables & Buckets Metadata

**Do**

1. Add DynamoDB tables:

   * **Students**: PK `teacher_id`, SK `student_id`

   * **Assignments**: PK `teacher_id`, SK `assignment_id`

   * Confirm existing **EssayMetrics** extended (see 7.4)

2. Add S3 bucket prefix policy for `teacher_id/assignments/<assignment_id>/`.

**Files**

* `lib/vocab_stack.ts` (DDB definitions, IAM grants)

**Acceptance**

* Tables deployed with on-demand billing and appropriate IAM for Lambdas.

## 7.2 Backend — Student CRUD

**Do**

* Endpoints:

  * `POST /students` `{ name, grade_level?, notes? }`

  * `GET /students` (list by `teacher_id`)

  * `GET /students/{id}`

  * `PATCH /students/{id}`

  * `DELETE /students/{id}`

**Files**

* `lambda/api/app/routes/students.py`

* `lambda/api/app/db/students.py`

* `lambda/api/app/models/student.py` (Pydantic)

**Acceptance**

* Full CRUD works, rows are namespaced by `teacher_id`.

## 7.3 Backend — Assignments CRUD + Presigned Upload

**Do**

* Endpoints:

  * `POST /assignments` `{ name, description? }` → returns `assignment_id`

  * `GET /assignments`

  * `GET /assignments/{id}`

  * `POST /assignments/{id}/upload-url` `{ file_name }` → presigned PUT URL to `s3://.../{teacher_id}/assignments/{assignment_id}/{file_name}`

**Files**

* `lambda/api/app/routes/assignments.py`

* `lambda/api/app/db/assignments.py`

**Acceptance**

* Can create assignment and retrieve presigned URL (expires in 15m).

## 7.4 Schema Update — EssayMetrics Partitioning

**Do**

* Ensure `EssayMetrics` writes use:

  * **PK**: `teacher_id#assignment_id`

  * **SK**: `student_id#essay_id`

* Existing single-essay path should now populate `assignment_id` (create a "Single Upload" assignment implicitly if missing).

**Files**

* `lambda/processor/app/store.py` or existing DAO layer

* Migration note (no data migration required for PoC; treat old essays as `assignment_id = "legacy"`).

**Acceptance**

* New processed essays appear under the composite key.

## 7.5 S3 Trigger — Batch Extraction & Routing

**Do**

1. Enhance S3 trigger lambda to:

   * If uploaded file is `.zip`: extract to `/tmp`, enumerate `.txt`/`.md` files.

   * For each essay file: parse text, run spaCy NER (`PERSON`) and fallback regexes to detect student name.

   * Fuzzy match to existing students (e.g., rapidfuzz, threshold 85/100).

   * Create student if no good match.

   * Emit SQS message `{ essay_s3_key, teacher_id, assignment_id, student_id }`.

2. Non-zip single file case: same as above.

**Files**

* `lambda/s3_upload_trigger/handler.py`

* `lambda/s3_upload_trigger/requirements.txt` (add `spacy`, `rapidfuzz`)

* `Dockerfile` update if needed (or slim wheel layer)

**Acceptance**

* Upload a zip with 5 essays → 5 SQS messages pushed, each with resolved `student_id`.

**CLI Test (manual)**

```bash

aws s3 cp ./samples/assignment1.zip s3://$BUCKET/$TEACHER/assignments/$ASSIGNMENT_ID/assignment1.zip

```

Check CloudWatch logs + SQS metrics.

## 7.6 Processor Lambda — Accept student/assignment IDs

**Do**

* Update processor to read incoming message fields, attach to the existing analysis result, and write with new keys.

* No change to spaCy/Bedrock logic.

**Files**

* `lambda/processor/handler.py`

**Acceptance**

* Essays processed end-to-end with `teacher_id`, `assignment_id`, `student_id` populated.

## 7.7 Aggregation Lambda — ClassMetrics

**Do**

* New Lambda computes per-assignment aggregates:

  * avg `type_token_ratio`

  * avg `avg_word_freq_rank`

  * correctness distribution from feedback

* Persist to **ClassMetrics** table:

  * PK: `teacher_id`

  * SK: `assignment_id`

  * Payload: `{ stats: {...}, updated_at }`

* Trigger:

  * Option A: invoked by Processor after essay write via **SQS (EssayUpdateQueue)**

  * Option B: scheduled EventBridge rule (every 5 min)

  * Start with Option A for freshness.

**Files**

* `lib/vocab_stack.ts` (new queue + lambda)

* `lambda/aggregations/class_metrics/handler.py`

**Acceptance**

* After essays process, ClassMetrics row appears/updates.

## 7.8 Frontend — Students & Assignments UI + Upload

**Do**

* Pages:

  * `Students`: list/create/edit/delete

  * `Assignments`: list/create; detail page with **Upload** (presigned PUT) and class stats preview

* Drag-and-drop file zone (accept `.zip` or `.txt`)

**Files**

* `frontend/src/pages/Students.tsx`

* `frontend/src/pages/Assignments.tsx`

* `frontend/src/pages/AssignmentDetail.tsx`

* `frontend/src/components/UploadBox.tsx`

**Acceptance**

* Create assignment, upload zip, see "Processing…" then stats appear.

## 7.9 Tests

**Do**

* Backend:

  * Unit: name extraction heuristics (NER + regex fallback)

  * Integration: upload zip → S3 trigger → SQS messages count == files

* Frontend:

  * Render students list, create assignment, mock upload.

**Files**

* `lambda/s3_upload_trigger/tests/test_name_extract.py`

* `lambda/api/tests/test_assignments_api.py`

* `frontend/src/__tests__/assignments.test.tsx`

**Acceptance**

* All pass; manual E2E shows class stats.

---

# Epic 8 — Analytics & Teacher Review Interface

**Goal:** Class & student dashboards; teacher overrides of AI feedback; aggregates refresh on change.

## 8.1 CDK — Metrics Tables & Update Queue

**Do**

* Add **StudentMetrics** table:

  * PK: `teacher_id`

  * SK: `student_id`

  * Payload: rolling stats + small history array (or store time series elsewhere)

* Add **EssayUpdateQueue** (if not already added in 7.7).

* Wire IAM to allow Lambdas to write both metrics tables.

**Files**

* `lib/vocab_stack.ts`

**Acceptance**

* Resources deployed, IAM verified.

## 8.2 Backend — Metrics Endpoints

**Do**

* `GET /metrics/class/{assignment_id}` → returns ClassMetrics row

* `GET /metrics/student/{student_id}` → returns StudentMetrics row (+ recent essays summary)

* **Query patterns**: use composite keys with `teacher_id` from JWT

**Files**

* `lambda/api/app/routes/metrics.py`

* `lambda/api/app/db/metrics.py`

**Acceptance**

* Returns 200 with stable JSON schema.

## 8.3 Aggregation Lambda — StudentMetrics

**Do**

* On essay processed **or** overridden:

  * Recompute student rolling stats:

    * avg TTR, avg difficulty, correctness rate over last N essays (N=10 default)

  * Write to StudentMetrics

* Source of truth remains `EssayMetrics`.

**Files**

* `lambda/aggregations/student_metrics/handler.py`

**Acceptance**

* StudentMetrics updates within ~1 minute of essay change.

## 8.4 Backend — Essay Review + Override

**Do**

* `GET /essays/{essay_id}` → full essay metrics + feedback

* `PATCH /essays/{essay_id}/override` body:

  ```json

  {

    "overrides": [

      { "word": "articulated", "correct": true, "comment": "teacher override" }

    ]

  }

  ```

* Apply overrides:

  * Merge with existing `feedback[]` (by word index or token id).

  * Persist updated feedback and `updated_at`.

  * Publish message to `EssayUpdateQueue` for aggregates recalculation.

  * Append to an audit trail field `overrides_log`.

**Files**

* `lambda/api/app/routes/essays.py`

* `lambda/api/app/db/essays.py`

**Acceptance**

* PATCH returns 200; subsequent metrics endpoints reflect the change.

## 8.5 Frontend — Dashboards & Review UI

**Do**

* **Class Dashboard** (`/assignments/:id`):

  * Charts: avg TTR (bar), correctness distribution (pie), difficulty (bar)

  * Table: students with per-assignment score

* **Student Dashboard** (`/students/:id`):

  * Line chart over time: TTR, correctness rate

  * Recent essays list

* **Essay Review** (`/essays/:id`):

  * Word-level chips with colors

  * Toggle correct/incorrect; edit comment; "Save Overrides"

**Files**

* `frontend/src/pages/ClassDashboard.tsx`

* `frontend/src/pages/StudentDashboard.tsx`

* `frontend/src/pages/EssayReview.tsx`

* `frontend/src/components/charts/*` (Recharts)

* `frontend/src/components/WordFeedback.tsx`

**Acceptance**

* Overrides persist; dashboards update (after queue processing).

## 8.6 Observability — Logs & Alarms

**Do**

* Add logs for override events with `teacher_id`, `essay_id`, count of changes.

* CloudWatch alarm: `EssayUpdateQueue` age > 2 minutes → SNS.

**Files**

* `lib/vocab_stack.ts` (alarm)

* Add structured logs in handlers.

**Acceptance**

* Alarm triggers if queue stalls; logs show override audit.

## 8.7 Tests

**Do**

* Backend:

  * Unit: merge overrides logic (idempotent, indexed by token id)

  * Integration: PATCH override → metrics recompute

* Frontend:

  * E2E: simulate override and see UI reflect after refresh (mock polling or actual queue if running localstack)

**Files**

* `lambda/api/tests/test_overrides.py`

* `lambda/aggregations/tests/test_student_metrics.py`

* `frontend/src/__tests__/essay_review.test.tsx`

**Acceptance**

* All tests pass; manual override demo works.

---

## Shared Implementation Notes (for Cursor)

* **Token → teacher_id mapping**

  Use Cognito `sub` as `teacher_id`. Also store `email` for display; never trust frontend for IDs.

* **Name Extraction Heuristics**

  1. NER `PERSON` candidates; 2) top-of-doc regex (`^Name:\s*(.+)$`, `^\s*(.+)\s*—\s*Grade`); 3) choose the first candidate with highest score; 4) normalize (lowercase, strip punctuation) before fuzzy match.

* **Fuzzy Match**

  Use `rapidfuzz.fuzz.ratio(candidate, existing_name) >= 85`. If tie, prefer existing with more essays.

* **Data Shapes**

  * `EssayMetrics` (extended)

    ```json

    {

      "pk": "teacher_id#assignment_id",

      "sk": "student_id#essay_id",

      "status": "processed",

      "metrics": {...},

      "feedback": [...],

      "student_id": "uuid",

      "assignment_id": "uuid",

      "teacher_id": "uuid",

      "created_at": "...",

      "updated_at": "..."

    }

    ```

  * `ClassMetrics`

    ```json

    {

      "teacher_id": "uuid",

      "assignment_id": "uuid",

      "stats": {

        "avg_ttr": 0.41,

        "avg_freq_rank": 1750,

        "correctness": {"correct": 0.78, "incorrect": 0.22}

      },

      "updated_at": "..."

    }

    ```

  * `StudentMetrics`

    ```json

    {

      "teacher_id": "uuid",

      "student_id": "uuid",

      "stats": {

        "avg_ttr": 0.39,

        "avg_correctness": 0.74,

        "essay_count": 12

      },

      "history": [

        {"essay_id":"...","ttr":0.42,"correctness":0.76,"date":"..."}

      ],

      "updated_at": "..."

    }

    ```

* **IAM Quick Grants**

  * API Lambda: `dynamodb:*` on Teachers/Students/Assignments/EssayMetrics/ClassMetrics/StudentMetrics (restrict to item-level if you want to be pedantic later).

  * S3 Trigger: `s3:GetObject`, `sqs:SendMessage`.

  * Processor: `sqs:ReceiveMessage`, `dynamodb:PutItem/UpdateItem`.

  * Aggregations: `sqs:ReceiveMessage`, `dynamodb:Query/PutItem/UpdateItem`.

* **Local Dev Tips**

  * Use **LocalStack** for API + DDB + SQS; Cognito can be stubbed with a static JWT in dev.

  * Provide `.env` variables:

    ```

    COGNITO_USER_POOL_ID=

    COGNITO_CLIENT_ID=

    COGNITO_REGION=us-east-1

    API_BASE_URL=

    ```

---

## Demo Script (end-to-end sanity)

1. Login → land on Assignments page.

2. Create assignment "Unit 3 — Ecosystems".

3. Upload `ecosystems.zip` with 5 essays.

4. See "Processing…" then class averages populate.

5. Click a student → see trend line.

6. Open an essay → flip 2 words to "correct" and save.

7. Return to student dashboard → averages move slightly (within ~1 min).

8. Show CloudWatch log entry for override audit.


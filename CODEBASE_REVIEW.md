# Codebase Review - Simplified Async Architecture Migration

## ✅ Completed Components

### 1. Core Architecture

- ✅ Worker Lambda created (`lambda/worker/`) with OpenAI integration
- ✅ Batch upload endpoint created (`POST /essays/batch`)
- ✅ Essays DynamoDB table created with correct schema
- ✅ SQS queue configured with DLQ
- ✅ CDK stack updated with Worker Lambda and Essays table
- ✅ Frontend updated to use batch upload API
- ✅ Legacy code directories removed (processor, s3_upload_trigger, aggregations)

### 2. API Lambda

- ✅ Batch endpoint implemented correctly
- ✅ No OpenAI code in API Lambda
- ✅ SQS messages contain only IDs (no essay_text)
- ✅ GET /essays/{essay_id} queries Essays table

### 3. Worker Lambda

- ✅ Loads essay_text from DynamoDB (not from SQS)
- ✅ Calls OpenAI GPT-4.1-mini
- ✅ Updates DynamoDB with vocabulary_analysis
- ✅ Handles retries and errors

## ⚠️ Issues Found

### 1. Legacy Tables Still in CDK Stack

**Location**: `lib/vocab_recommendation-stack.ts`

**Issues**:

- `metricsTable` (EssayMetrics) - Line 60-69 - Should be removed
- `classMetricsTable` - Line 101-108 - Should be removed
- `studentMetricsTable` - Line 111-118 - Should be removed

**Impact**: Unnecessary infrastructure, extra costs, confusion

**Fix**: Remove these table definitions and their IAM grants

### 2. API Lambda Still References Legacy Tables

**Location**: `lambda/api/app/routes/essays.py`

**Issues**:

- `list_student_essays()` endpoint (line 223-286) uses `metrics_table`
- `override_essay_feedback()` endpoint (line 289-387) uses `metrics_table` and `ESSAY_UPDATE_QUEUE_URL`

**Impact**: These endpoints will fail or return incorrect data

**Fix**: Update to use `essays_table` instead, or remove if not needed

### 3. Metrics Endpoints Depend on Removed Tables

**Location**: `lambda/api/app/routes/metrics.py`

**Issues**:

- `get_class_metrics()` uses `class_metrics_table` (removed)
- `get_student_metrics()` uses `student_metrics_table` (removed)

**Impact**: Endpoints will return 500 errors

**Fix**: Either remove these endpoints or compute metrics on-demand from Essays table

### 4. Legacy Environment Variables

**Location**: `lambda/api/main.py`, `lambda/api/app/routes/essays.py`

**Issues**:

- `METRICS_TABLE` still referenced (line 43 in main.py, line 27 in essays.py)
- `ESSAY_UPDATE_QUEUE_URL` still referenced (line 28 in essays.py)
- `ESSAYS_BUCKET` still referenced (may be needed for presigned URLs)

**Impact**: Unused environment variables, potential confusion

**Fix**: Remove unused variables, keep ESSAYS_BUCKET if presigned URLs are still used

### 5. IAM Permissions Reference Removed Tables

**Location**: `lib/vocab_recommendation-stack.ts`

**Issues**:

- API Lambda role grants permissions to removed tables (line 142, 146-147)

**Impact**: Unnecessary permissions, potential security concern

**Fix**: Remove grants for removed tables

### 6. S3 Bucket Status

**Location**: `lib/vocab_recommendation-stack.ts` line 21-36

**Status**: Still exists and is used for presigned URLs in assignments endpoint

**Decision Needed**:

- If presigned URLs are still used → Keep bucket
- If all uploads go through `/essays/batch` → Remove bucket

**Current Usage**:

- `POST /assignments/{assignment_id}/upload-url` still generates presigned URLs
- Frontend uses `uploadBatchEssays()` which doesn't need S3

**Recommendation**: Remove presigned URL endpoint and S3 bucket if not needed

## 📋 Recommended Fixes

### Priority 1: Remove Legacy Tables from CDK

1. Remove `metricsTable`, `classMetricsTable`, `studentMetricsTable` definitions
2. Remove IAM grants for these tables
3. Remove environment variables for these tables from API Lambda

### Priority 2: Update Essays Endpoints

1. Update `list_student_essays()` to query Essays table
2. Update `override_essay_feedback()` to use Essays table
3. Remove `ESSAY_UPDATE_QUEUE_URL` references

### Priority 3: Handle Metrics Endpoints

1. Option A: Remove metrics endpoints entirely
2. Option B: Compute metrics on-demand from Essays table
3. Option C: Return empty/placeholder responses

### Priority 4: Clean Environment Variables

1. Remove `METRICS_TABLE` from API Lambda env vars
2. Remove `CLASS_METRICS_TABLE` and `STUDENT_METRICS_TABLE` from API Lambda env vars
3. Keep `ESSAYS_BUCKET` if presigned URLs are still used

## ✅ Architecture Verification

### Processing Flow

✅ Upload essays → API Lambda → SQS → Worker Lambda → DynamoDB

### Components

✅ API Lambda (no OpenAI)
✅ Worker Lambda (OpenAI only)
✅ One SQS queue (EssayProcessingQueue + DLQ)
✅ Essays table (assignment_id/essay_id keys)
✅ No ECS, no S3 triggers, no aggregations

### SQS Messages

✅ Contain only IDs: `{ teacher_id, assignment_id, student_id, essay_id }`
✅ No essay_text in messages

### Worker Lambda

✅ Loads essay_text from DynamoDB
✅ Processes with OpenAI
✅ Updates DynamoDB with results

## 🎯 Next Steps

1. Fix Priority 1 issues (remove legacy tables from CDK)
2. Fix Priority 2 issues (update essays endpoints)
3. Fix Priority 3 issues (handle metrics endpoints)
4. Fix Priority 4 issues (clean environment variables)
5. Test end-to-end flow
6. Update tests to reflect new architecture

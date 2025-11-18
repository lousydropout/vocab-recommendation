# Iterative Testing Workflow

This document describes the iterative testing workflow for submitting mock student essays and verifying the end-to-end processing pipeline.

## Overview

The workflow allows you to:
1. Clear all DynamoDB tables for a clean slate
2. Submit 15 mock essays from `essays/essays/prompt_1_2025-11-13/`
3. Verify students are auto-created via name extraction
4. Verify essays are processed and metrics are aggregated
5. Iterate and fix issues as needed

## Prerequisites

- AWS CLI configured with appropriate credentials
- Access to the deployed stack (Cognito, API Gateway, DynamoDB, S3, SQS)
- Configuration file `.e2e_config` (or be prepared to enter values interactively)
- Required tools: `aws`, `curl`, `jq`

## Workflow Steps

### Step 1: Clear All Tables

Start with a clean slate by clearing all DynamoDB tables:

```bash
./bin/clear-dynamodb-tables.sh --confirm
```

This clears:
- `VincentVocabEssayMetrics`
- `VincentVocabTeachers`
- `VincentVocabStudents`
- `VincentVocabAssignments`
- `VincentVocabClassMetrics`
- `VincentVocabStudentMetrics`

**Note:** The teacher record will be recreated automatically on first API call via `/auth/health`.

### Step 2: Run Submission Script

Submit all 15 mock essays:

```bash
./submit_mock_essays.sh
```

The script will:
1. Load configuration from `.e2e_config` (or prompt for values)
2. Load prompt from `essays/memory-bank/prompts.json`
3. Discover all `.txt` files in `essays/essays/prompt_1_2025-11-13/`
4. Authenticate with Cognito
5. Create an assignment using the prompt text
6. Upload all 15 essays via presigned URLs
7. Students will be auto-created by S3 trigger Lambda via name extraction

**Expected Output:**
- 15 essays discovered
- Assignment created with prompt text
- 15 essays uploaded successfully
- Students auto-created (may take a few seconds)

### Step 3: Wait for Processing

Processing typically takes 30-60 seconds per essay. The script will optionally wait and verify, or you can monitor manually.

**Monitor S3 Trigger Lambda:**
```bash
aws logs tail /aws/lambda/vincent-vocab-s3-upload-lambda --follow --region us-east-1
```

**Monitor Processor (ECS):**
```bash
aws logs tail /ecs/vocab-processor --follow --region us-east-1
```

**Check SQS Queue:**
```bash
aws sqs get-queue-attributes \
  --queue-url <PROCESSING_QUEUE_URL> \
  --attribute-names ApproximateNumberOfMessages \
  --region us-east-1
```

### Step 4: Verify Results

#### Check Students Created

Verify all 15 students were auto-created:

```bash
# Get teacher ID from JWT (saved in .jwt_token)
TEACHER_ID=$(cat .jwt_token | cut -d. -f2 | sed 's/-/+/g; s/_/\//g' | base64 -d 2>/dev/null | jq -r '.sub')

# Query students
aws dynamodb scan \
  --table-name VincentVocabStudents \
  --filter-expression "teacher_id = :tid" \
  --expression-attribute-values "{\":tid\":{\"S\":\"$TEACHER_ID\"}}" \
  --region us-east-1 | jq '.Items | length'
```

**Expected:** 15 students

**List student names:**
```bash
aws dynamodb scan \
  --table-name VincentVocabStudents \
  --filter-expression "teacher_id = :tid" \
  --expression-attribute-values "{\":tid\":{\"S\":\"$TEACHER_ID\"}}" \
  --region us-east-1 | jq -r '.Items[] | .name.S' | sort
```

#### Check Essays Processed

Verify all 15 essays were processed:

```bash
# Get assignment ID from .mock_submission_info
ASSIGNMENT_ID=$(grep ASSIGNMENT_ID .mock_submission_info | cut -d'"' -f2)

# Query essays
aws dynamodb scan \
  --table-name VincentVocabEssayMetrics \
  --filter-expression "assignment_id = :aid" \
  --expression-attribute-values "{\":aid\":{\"S\":\"$ASSIGNMENT_ID\"}}" \
  --region us-east-1 | jq '.Items | length'
```

**Expected:** 15 essays

**Check processing status:**
```bash
aws dynamodb scan \
  --table-name VincentVocabEssayMetrics \
  --filter-expression "assignment_id = :aid" \
  --expression-attribute-values "{\":aid\":{\"S\":\"$ASSIGNMENT_ID\"}}" \
  --region us-east-1 | jq '[.Items[] | select(.status.S == "processed")] | length'
```

**Expected:** 15 processed essays

#### Check Class Metrics

Verify class-level metrics were aggregated:

```bash
# Get JWT and assignment ID
JWT=$(cat .jwt_token)
ASSIGNMENT_ID=$(grep ASSIGNMENT_ID .mock_submission_info | cut -d'"' -f2)
API_URL=$(grep API_URL .mock_submission_info | cut -d'"' -f2)

# Get class metrics
curl -H "Authorization: Bearer $JWT" \
  "$API_URL/metrics/class/$ASSIGNMENT_ID" | jq
```

**Expected:**
- `essay_count`: 15
- `avg_type_token_ratio`: Calculated average
- `avg_word_count`: Calculated average
- `correctness_rate`: Percentage of correct words

#### Check Student Metrics

Verify student-level metrics were aggregated:

```bash
# Get a student ID
STUDENT_ID=$(aws dynamodb scan \
  --table-name VincentVocabStudents \
  --filter-expression "teacher_id = :tid" \
  --expression-attribute-values "{\":tid\":{\"S\":\"$TEACHER_ID\"}}" \
  --region us-east-1 | jq -r '.Items[0].student_id.S')

# Get student metrics
curl -H "Authorization: Bearer $JWT" \
  "$API_URL/metrics/student/$STUDENT_ID" | jq
```

**Expected:**
- `total_essays`: 1 (each student has one essay)
- `avg_type_token_ratio`: Calculated from their essay
- `avg_word_count`: Calculated from their essay

### Step 5: Iterate if Needed

If issues are found:

1. **Clear tables again:**
   ```bash
   ./bin/clear-dynamodb-tables.sh --confirm
   ```

2. **Fix the issue:**
   - Check CloudWatch logs for errors
   - Verify name extraction patterns
   - Check S3 trigger Lambda logic
   - Verify processor Lambda/ECS is running

3. **Re-run submission:**
   ```bash
   ./submit_mock_essays.sh
   ```

4. **Verify again** using Step 4 commands

## Verification Checklist

After each iteration, verify:

- [ ] All 15 students created in DynamoDB
- [ ] All 15 essays uploaded to S3
- [ ] All 15 essays processed (status="processed")
- [ ] Class metrics computed correctly
- [ ] Student metrics computed correctly
- [ ] No errors in CloudWatch logs
- [ ] SQS queue empty (all messages processed)

## Common Issues

### Students Not Created

**Symptom:** Fewer than 15 students in database

**Possible Causes:**
- Name extraction Pattern 4 not matching essay format
- S3 trigger Lambda not processing files
- Student matching threshold too high (fuzzy matching)

**Debug:**
```bash
# Check S3 trigger logs
aws logs tail /aws/lambda/vincent-vocab-s3-upload-lambda --follow

# Check if files are in S3
aws s3 ls s3://<BUCKET>/<TEACHER_ID>/assignments/<ASSIGNMENT_ID>/ --recursive
```

### Essays Not Processing

**Symptom:** Essays stuck in "awaiting_processing" or "processing" status

**Possible Causes:**
- ECS Fargate service not running
- SQS messages not being consumed
- Processor errors

**Debug:**
```bash
# Check SQS queue
aws sqs get-queue-attributes \
  --queue-url <PROCESSING_QUEUE_URL> \
  --attribute-names ApproximateNumberOfMessages

# Check ECS service status
aws ecs describe-services \
  --cluster vincent-vocab-processor-cluster \
  --services ProcessorService \
  --region us-east-1 | jq '.services[0] | {status, runningCount, desiredCount}'

# Check processor logs
aws logs tail /ecs/vocab-processor --follow
```

### Metrics Not Aggregating

**Symptom:** Class/student metrics empty or incorrect

**Possible Causes:**
- Aggregation Lambda not triggered
- EssayUpdateQueue messages missing student_id
- Aggregation Lambda errors

**Debug:**
```bash
# Check EssayUpdateQueue
aws sqs get-queue-attributes \
  --queue-url <ESSAY_UPDATE_QUEUE_URL> \
  --attribute-names ApproximateNumberOfMessages

# Check aggregation Lambda logs
aws logs tail /aws/lambda/vincent-vocab-class-metrics-lambda --follow
aws logs tail /aws/lambda/vincent-vocab-student-metrics-lambda --follow
```

## Quick Reference

**Configuration File:** `.e2e_config`
```bash
COGNITO_USER_POOL_ID=us-east-1_65hpvHpPX
COGNITO_CLIENT_ID=jhnvud4iqcf15vac6nc2d2b9p
TEACHER_EMAIL=teacher@example.com
TEACHER_PASSWORD=your-password
API_URL=https://m18eg6bei9.execute-api.us-east-1.amazonaws.com/prod
ESSAYS_BUCKET=vincent-vocab-essays-971422717446-us-east-1
PROCESSING_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/.../vincent-vocab-essay-processing-queue
```

**Saved Files:**
- `.jwt_token` - JWT token for API calls
- `.mock_submission_info` - Assignment ID and other info

**Key Commands:**
```bash
# Clear all tables
./bin/clear-dynamodb-tables.sh --confirm

# Submit essays
./submit_mock_essays.sh

# Check students
aws dynamodb scan --table-name VincentVocabStudents --filter-expression "teacher_id = :tid" --expression-attribute-values '{\":tid\":{\"S\":\"$TEACHER_ID\"}}' --region us-east-1 | jq

# Check essays
aws dynamodb scan --table-name VincentVocabEssayMetrics --filter-expression "assignment_id = :aid" --expression-attribute-values "{\":aid\":{\"S\":\"$ASSIGNMENT_ID\"}}" --region us-east-1 | jq
```

## Essay Format

Essays should have the format:
```
FirstName LastName
MM/DD/YYYY

[Optional Title]

Essay body text...
```

The name extraction Pattern 4 will match the first line (e.g., "Maya Thompson") and auto-create the student.

## Expected Results

After successful processing:
- **15 students** created in `VincentVocabStudents`
- **15 essays** processed in `VincentVocabEssayMetrics`
- **1 class metric** record in `VincentVocabClassMetrics`
- **15 student metric** records in `VincentVocabStudentMetrics`
- All essays have `status="processed"`
- All metrics have calculated values



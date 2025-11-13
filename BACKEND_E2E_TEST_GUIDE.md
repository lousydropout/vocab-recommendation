# Backend-Only E2E Testing Guide
## Vocabulary Analyzer Pipeline - Complete Walkthrough

This guide provides step-by-step instructions to test the entire Vocabulary Analyzer pipeline using **ONLY AWS CLI and curl**. No frontend required.

---

## Prerequisites

1. **AWS CLI configured** with appropriate credentials
2. **Teacher account exists** in Cognito User Pool
3. **Stack deployed** (all resources created)
4. **Test essay file** ready (e.g., `essay.txt`)

---

## Configuration Variables

Set these variables at the start of your testing session:

```bash
# AWS Region
export AWS_REGION="us-east-1"  # Adjust to your deployment region

# Cognito Configuration
export COGNITO_USER_POOL_ID="<YOUR_POOL_ID>"  # e.g., us-east-1_XXXXXXXXX
export COGNITO_CLIENT_ID="<YOUR_CLIENT_ID>"   # Get from AWS Console or CDK outputs

# Teacher Credentials
export TEACHER_EMAIL="teacher@example.com"
export TEACHER_PASSWORD="YourSecurePassword123!"

# API Gateway
export API_URL="https://<api-id>.execute-api.${AWS_REGION}.amazonaws.com/prod"

# S3 Bucket (from CDK outputs or AWS Console)
export ESSAYS_BUCKET="vincent-vocab-essays-<account-id>-${AWS_REGION}"

# SQS Queue URL (get from AWS Console or CDK outputs)
export PROCESSING_QUEUE_URL="https://sqs.${AWS_REGION}.amazonaws.com/<account-id>/vincent-vocab-essay-processing-queue"

# Lambda Function Names
export S3_UPLOAD_LAMBDA="vincent-vocab-s3-upload-lambda"
export PROCESSOR_LAMBDA="vincent-vocab-processor-lambda"

# DynamoDB Table Names
export ESSAY_METRICS_TABLE="VincentVocabEssayMetrics"
export CLASS_METRICS_TABLE="VincentVocabClassMetrics"
export STUDENT_METRICS_TABLE="VincentVocabStudentMetrics"
```

---

## Step 1: Authenticate with Cognito

**Purpose:** Obtain JWT ID token for API authentication.

**Command:**
```bash
AUTH_RESPONSE=$(aws cognito-idp initiate-auth \
  --region ${AWS_REGION} \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id ${COGNITO_CLIENT_ID} \
  --auth-parameters "USERNAME=${TEACHER_EMAIL},PASSWORD=${TEACHER_PASSWORD}")

# Extract ID token
TEACHER_JWT=$(echo $AUTH_RESPONSE | jq -r '.AuthenticationResult.IdToken')

# Verify token was extracted
if [ "$TEACHER_JWT" == "null" ] || [ -z "$TEACHER_JWT" ]; then
  echo "ERROR: Failed to authenticate. Check credentials."
  exit 1
fi

echo "✓ Authentication successful"
echo "Token (first 50 chars): ${TEACHER_JWT:0:50}..."
```

**What this validates:**
- Cognito User Pool is accessible
- Teacher credentials are valid
- JWT token generation works

---

## Step 2: Create an Assignment

**Purpose:** Create a new assignment to organize essays.

**Command:**
```bash
ASSIGNMENT_RESPONSE=$(curl -X POST "${API_URL}/assignments" \
  -H "Authorization: Bearer ${TEACHER_JWT}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "E2E Test Assignment",
    "description": "Backend-only E2E test assignment"
  }')

# Extract assignment_id
ASSIGNMENT_ID=$(echo $ASSIGNMENT_RESPONSE | jq -r '.assignment_id')

# Verify assignment was created
if [ "$ASSIGNMENT_ID" == "null" ] || [ -z "$ASSIGNMENT_ID" ]; then
  echo "ERROR: Failed to create assignment"
  echo "Response: $ASSIGNMENT_RESPONSE"
  exit 1
fi

echo "✓ Assignment created"
echo "Assignment ID: ${ASSIGNMENT_ID}"
echo "Full response: $ASSIGNMENT_RESPONSE"
```

**What this validates:**
- API Gateway is accessible
- Cognito authorizer works
- Assignment creation endpoint functions
- DynamoDB write to Assignments table

---

## Step 3: Create or Verify a Student

**Purpose:** Create a test student record for essay association.

**Command:**
```bash
STUDENT_RESPONSE=$(curl -X POST "${API_URL}/students" \
  -H "Authorization: Bearer ${TEACHER_JWT}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Student",
    "grade_level": 10,
    "notes": "E2E test student"
  }')

# Extract student_id
STUDENT_ID=$(echo $STUDENT_RESPONSE | jq -r '.student_id')

# Verify student was created
if [ "$STUDENT_ID" == "null" ] || [ -z "$STUDENT_ID" ]; then
  echo "ERROR: Failed to create student"
  echo "Response: $STUDENT_RESPONSE"
  exit 1
fi

echo "✓ Student created"
echo "Student ID: ${STUDENT_ID}"
echo "Full response: $STUDENT_RESPONSE"
```

**What this validates:**
- Student creation endpoint works
- DynamoDB write to Students table
- Teacher isolation (student belongs to authenticated teacher)

---

## Step 4: Request Presigned S3 Upload URL

**Purpose:** Get a presigned URL to upload essay file directly to S3.

**Command:**
```bash
UPLOAD_URL_RESPONSE=$(curl -X POST "${API_URL}/assignments/${ASSIGNMENT_ID}/upload-url" \
  -H "Authorization: Bearer ${TEACHER_JWT}" \
  -H "Content-Type: application/json" \
  -d '{
    "file_name": "test_essay.txt"
  }')

# Extract presigned URL and file key
PRESIGNED_URL=$(echo $UPLOAD_URL_RESPONSE | jq -r '.presigned_url')
FILE_KEY=$(echo $UPLOAD_URL_RESPONSE | jq -r '.file_key')

# Verify presigned URL was generated
if [ "$PRESIGNED_URL" == "null" ] || [ -z "$PRESIGNED_URL" ]; then
  echo "ERROR: Failed to get presigned URL"
  echo "Response: $UPLOAD_URL_RESPONSE"
  exit 1
fi

echo "✓ Presigned URL generated"
echo "File Key: ${FILE_KEY}"
echo "Presigned URL (first 100 chars): ${PRESIGNED_URL:0:100}..."
```

**What this validates:**
- Presigned URL generation works
- S3 bucket permissions are correct
- Assignment ownership verification

---

## Step 5: Upload Essay File to S3

**Purpose:** Upload essay content to S3 using the presigned URL.

**Prerequisites:** Create a test essay file:
```bash
cat > essay.txt << 'EOF'
The quick brown fox jumps over the lazy dog. This is a test essay for vocabulary analysis.
The student articulated their thoughts clearly and demonstrated excellent vocabulary usage.
EOF
```

**Command:**
```bash
UPLOAD_RESPONSE=$(curl --upload-file essay.txt "${PRESIGNED_URL}")

# Check HTTP status (should be 200)
if [ $? -eq 0 ]; then
  echo "✓ Essay uploaded to S3"
  echo "File Key: ${FILE_KEY}"
else
  echo "ERROR: Upload failed"
  exit 1
fi

# Verify file exists in S3
aws s3 ls "s3://${ESSAYS_BUCKET}/${FILE_KEY}" --region ${AWS_REGION}
if [ $? -eq 0 ]; then
  echo "✓ Verified file exists in S3"
else
  echo "WARNING: File not found in S3 (may take a moment to appear)"
fi
```

**What this validates:**
- Presigned URL is valid and functional
- S3 upload succeeds
- File is stored correctly

---

## Step 6: Observe S3 Upload Trigger Lambda

**Purpose:** Verify that S3 event triggers the S3 Upload Lambda function.

**Command:**
```bash
echo "Monitoring S3 Upload Trigger Lambda logs..."
echo "Press Ctrl+C to stop monitoring"

aws logs tail "/aws/lambda/${S3_UPLOAD_LAMBDA}" \
  --region ${AWS_REGION} \
  --follow \
  --format short \
  --since 5m
```

**Alternative (non-following, get recent logs):**
```bash
aws logs tail "/aws/lambda/${S3_UPLOAD_LAMBDA}" \
  --region ${AWS_REGION} \
  --format short \
  --since 5m | tail -20
```

**What to look for:**
- `"S3 upload trigger received"` - Lambda was invoked
- `"Message sent to SQS"` - SQS message was created
- `"essay_id"` - Essay ID was generated
- No error messages

**What this validates:**
- S3 event notification is configured
- S3 Upload Lambda is triggered
- Lambda processes the upload correctly
- SQS message is sent

---

## Step 7: Verify SQS Received the Message

**Purpose:** Confirm that the processing queue received the essay processing message.

**Command:**
```bash
echo "Checking SQS queue for messages..."

# Receive message (non-destructive peek)
SQS_MESSAGE=$(aws sqs receive-message \
  --queue-url ${PROCESSING_QUEUE_URL} \
  --region ${AWS_REGION} \
  --max-number-of-messages 1 \
  --wait-time-seconds 10)

if [ -z "$SQS_MESSAGE" ] || [ "$SQS_MESSAGE" == "null" ]; then
  echo "WARNING: No message found in queue (may have already been processed)"
  echo "Checking queue attributes..."
  aws sqs get-queue-attributes \
    --queue-url ${PROCESSING_QUEUE_URL} \
    --attribute-names ApproximateNumberOfMessages \
    --region ${AWS_REGION}
else
  echo "✓ Message found in SQS queue"
  echo "$SQS_MESSAGE" | jq '.'
  
  # Extract essay_id from message
  ESSAY_ID=$(echo "$SQS_MESSAGE" | jq -r '.Messages[0].Body' | jq -r '.essay_id')
  echo "Essay ID from SQS: ${ESSAY_ID}"
  
  # Note: Don't delete the message - let Processor Lambda consume it
fi
```

**What this validates:**
- SQS queue is accessible
- Message was sent by S3 Upload Lambda
- Message format is correct (contains essay_id, file_key, etc.)

---

## Step 8: Verify Processor Lambda Consumed the Message

**Purpose:** Confirm that Processor Lambda is processing the essay.

**Command:**
```bash
echo "Monitoring Processor Lambda logs..."
echo "Press Ctrl+C to stop monitoring"

aws logs tail "/aws/lambda/${PROCESSOR_LAMBDA}" \
  --region ${AWS_REGION} \
  --follow \
  --format short \
  --since 5m
```

**Alternative (non-following):**
```bash
aws logs tail "/aws/lambda/${PROCESSOR_LAMBDA}" \
  --region ${AWS_REGION} \
  --format short \
  --since 5m | tail -30
```

**What to look for:**
- `"Processor Lambda invoked"` - Lambda started
- `"Processing essay"` - Essay processing began
- `"Metrics computed"` - spaCy analysis completed
- `"Feedback generated"` - Bedrock feedback completed
- `"DynamoDB updated"` - Essay stored successfully
- `"status": "processed"` - Processing completed

**What this validates:**
- Processor Lambda is triggered by SQS
- Essay is downloaded from S3
- spaCy analysis runs successfully
- Bedrock feedback generation works
- DynamoDB write succeeds

**Note:** Processing may take 30-60 seconds depending on essay length and Bedrock response time.

---

## Step 9: Verify DynamoDB Contains EssayMetrics

**Purpose:** Confirm that the processed essay is stored in DynamoDB with metrics and feedback.

**First, extract teacher_id from JWT token:**
```bash
# Decode JWT to get teacher_id (sub claim)
# Note: JWT payload is base64url encoded, may need padding
TEACHER_ID=$(echo $TEACHER_JWT | cut -d. -f2 | sed 's/-/+/g; s/_/\//g' | base64 -d 2>/dev/null | jq -r '.sub')
if [ -z "$TEACHER_ID" ] || [ "$TEACHER_ID" == "null" ]; then
  echo "WARNING: Could not extract teacher_id from JWT. Using alternative method..."
  # Alternative: Query DynamoDB to find essay by assignment_id
  TEACHER_ID=""
fi
echo "Teacher ID: ${TEACHER_ID}"
```

**Command:**
```bash
# Query EssayMetrics table by essay_id
# Note: The table uses essay_id as partition key (not composite key)
# If you have the essay_id from SQS, use it; otherwise scan by assignment_id

# Option 1: If you have essay_id from SQS or previous steps
if [ ! -z "$ESSAY_ID" ]; then
  echo "Querying by essay_id: ${ESSAY_ID}"
  ESSAY_ITEM=$(aws dynamodb get-item \
    --table-name ${ESSAY_METRICS_TABLE} \
    --key "{\"essay_id\": {\"S\": \"${ESSAY_ID}\"}}" \
    --region ${AWS_REGION})
  
  echo "$ESSAY_ITEM" | jq '.'
  
  # Extract status
  STATUS=$(echo "$ESSAY_ITEM" | jq -r '.Item.status.S // .Item.status // "unknown"')
  echo "Status: ${STATUS}"
else
  echo "Scanning table for recent essays (may be slow)..."
  # Scan and filter by assignment_id (assignment_id is stored as an attribute, not a key)
  aws dynamodb scan \
    --table-name ${ESSAY_METRICS_TABLE} \
    --filter-expression "assignment_id = :aid" \
    --expression-attribute-values "{\":aid\": {\"S\": \"${ASSIGNMENT_ID}\"}}" \
    --region ${AWS_REGION} | jq '.Items[] | {
      essay_id: .essay_id.S,
      status: .status.S,
      teacher_id: .teacher_id.S,
      assignment_id: .assignment_id.S,
      student_id: .student_id.S,
      has_metrics: (.metrics != null),
      feedback_count: (.feedback | length)
    }'
  
  # Get the first essay_id from scan results
  ESSAY_ID=$(aws dynamodb scan \
    --table-name ${ESSAY_METRICS_TABLE} \
    --filter-expression "assignment_id = :aid" \
    --expression-attribute-values "{\":aid\": {\"S\": \"${ASSIGNMENT_ID}\"}}" \
    --region ${AWS_REGION} \
    --max-items 1 | jq -r '.Items[0].essay_id.S')
  
  if [ ! -z "$ESSAY_ID" ] && [ "$ESSAY_ID" != "null" ]; then
    echo "Found essay_id: ${ESSAY_ID}"
  fi
fi
```

**What to verify:**
- `status` = `"processed"` (not `"awaiting_processing"` or `"processing"`)
- `metrics` object exists with fields like:
  - `type_token_ratio`
  - `word_count`
  - `unique_words`
  - `avg_frequency_rank`
- `feedback` array exists with word-level feedback items
- `teacher_id`, `assignment_id`, `student_id` are populated

**What this validates:**
- Processor Lambda successfully wrote to DynamoDB
- All required fields are present
- Metrics and feedback are computed correctly

---

## Step 10: GET Essay Result via API

**Purpose:** Retrieve the processed essay via the API endpoint.

**Note:** 
- You need the `essay_id`. If you don't have it, extract it from DynamoDB query in Step 9.
- The endpoint is `/essay/{essay_id}` (singular), not `/essays/{essay_id}` (plural).

**Command:**
```bash
# If essay_id is not set, get it from DynamoDB
if [ -z "$ESSAY_ID" ]; then
  ESSAY_ID=$(aws dynamodb scan \
    --table-name ${ESSAY_METRICS_TABLE} \
    --filter-expression "teacher_id = :tid AND assignment_id = :aid" \
    --expression-attribute-values "{\":tid\": {\"S\": \"${TEACHER_ID}\"}, \":aid\": {\"S\": \"${ASSIGNMENT_ID}\"}}" \
    --region ${AWS_REGION} \
    --max-items 1 | jq -r '.Items[0].essay_id.S')
fi

echo "Fetching essay: ${ESSAY_ID}"

ESSAY_RESPONSE=$(curl -X GET "${API_URL}/essay/${ESSAY_ID}" \
  -H "Authorization: Bearer ${TEACHER_JWT}")

echo "$ESSAY_RESPONSE" | jq '.'

# Verify response
STATUS=$(echo $ESSAY_RESPONSE | jq -r '.status')
if [ "$STATUS" == "processed" ]; then
  echo "✓ Essay retrieved successfully"
  echo "Status: ${STATUS}"
  echo "Metrics present: $(echo $ESSAY_RESPONSE | jq 'has("metrics")')"
  echo "Feedback items: $(echo $ESSAY_RESPONSE | jq '.feedback | length')"
else
  echo "WARNING: Essay status is ${STATUS} (may still be processing)"
fi
```

**What this validates:**
- API endpoint `/essay/{essay_id}` works
- Authorization is enforced
- Essay data is returned correctly
- Status reflects processing completion

---

## Step 11: GET Class Metrics

**Purpose:** Retrieve aggregated class-level metrics for the assignment.

**Command:**
```bash
CLASS_METRICS_RESPONSE=$(curl -X GET "${API_URL}/metrics/class/${ASSIGNMENT_ID}" \
  -H "Authorization: Bearer ${TEACHER_JWT}")

echo "$CLASS_METRICS_RESPONSE" | jq '.'

# Verify metrics
ESSAY_COUNT=$(echo $CLASS_METRICS_RESPONSE | jq -r '.stats.essay_count // 0')
if [ "$ESSAY_COUNT" -gt 0 ]; then
  echo "✓ Class metrics retrieved"
  echo "Essay count: ${ESSAY_COUNT}"
  echo "Average TTR: $(echo $CLASS_METRICS_RESPONSE | jq -r '.stats.avg_ttr // 0')"
else
  echo "WARNING: No essays found in class metrics (may need to wait for aggregation)"
fi
```

**What this validates:**
- Class metrics endpoint works
- Aggregation Lambda processed the essay update
- Metrics are computed and stored in ClassMetrics table
- Teacher isolation (only sees their own assignment metrics)

---

## Step 12: GET Student Metrics

**Purpose:** Retrieve student-level rolling metrics.

**Command:**
```bash
STUDENT_METRICS_RESPONSE=$(curl -X GET "${API_URL}/metrics/student/${STUDENT_ID}" \
  -H "Authorization: Bearer ${TEACHER_JWT}")

echo "$STUDENT_METRICS_RESPONSE" | jq '.'

# Verify metrics
TOTAL_ESSAYS=$(echo $STUDENT_METRICS_RESPONSE | jq -r '.stats.total_essays // 0')
if [ "$TOTAL_ESSAYS" -gt 0 ]; then
  echo "✓ Student metrics retrieved"
  echo "Total essays: ${TOTAL_ESSAYS}"
  echo "Average TTR: $(echo $STUDENT_METRICS_RESPONSE | jq -r '.stats.avg_ttr // 0')"
else
  echo "WARNING: No essays found in student metrics (may need to wait for aggregation)"
fi
```

**What this validates:**
- Student metrics endpoint works
- Aggregation Lambda updated student metrics
- Rolling averages are computed correctly
- Teacher isolation (only sees their own students)

---

## Step 13: OPTIONAL - Perform Override Test

**Purpose:** Test teacher override functionality and verify metrics recomputation.

**Command:**
```bash
# Override feedback for a specific word
OVERRIDE_RESPONSE=$(curl -X PATCH "${API_URL}/essays/${ESSAY_ID}/override" \
  -H "Authorization: Bearer ${TEACHER_JWT}" \
  -H "Content-Type: application/json" \
  -d '{
    "feedback": [
      {
        "word": "articulated",
        "correct": true,
        "comment": "Teacher override test - word is correct"
      }
    ]
  }')

echo "$OVERRIDE_RESPONSE" | jq '.'

# Verify override succeeded
if [ "$(echo $OVERRIDE_RESPONSE | jq -r '.message')" != "null" ]; then
  echo "✓ Override successful"
else
  echo "ERROR: Override failed"
  exit 1
fi

# Wait a few seconds for aggregation to process
echo "Waiting 10 seconds for metrics recomputation..."
sleep 10

# Re-query class metrics to verify updated aggregates
echo "Re-checking class metrics after override..."
CLASS_METRICS_AFTER=$(curl -X GET "${API_URL}/metrics/class/${ASSIGNMENT_ID}" \
  -H "Authorization: Bearer ${TEACHER_JWT}")

echo "$CLASS_METRICS_AFTER" | jq '.'

# Re-query student metrics
echo "Re-checking student metrics after override..."
STUDENT_METRICS_AFTER=$(curl -X GET "${API_URL}/metrics/student/${STUDENT_ID}" \
  -H "Authorization: Bearer ${TEACHER_JWT}")

echo "$STUDENT_METRICS_AFTER" | jq '.'

# Verify essay was updated
ESSAY_AFTER=$(curl -X GET "${API_URL}/essay/${ESSAY_ID}" \
  -H "Authorization: Bearer ${TEACHER_JWT}")

echo "Essay after override:"
echo "$ESSAY_AFTER" | jq '.feedback[] | select(.word == "articulated")'
```

**What this validates:**
- Override endpoint works
- DynamoDB update succeeds
- EssayUpdateQueue receives message
- Aggregation Lambda recomputes metrics
- Updated metrics reflect the override

---

## Troubleshooting

### Authentication Fails
- Verify Cognito User Pool ID and Client ID
- Check teacher credentials
- Ensure USER_PASSWORD_AUTH is enabled for the client

### API Returns 401/403
- Verify JWT token is valid (not expired)
- Check API Gateway authorizer configuration
- Ensure token is in `Authorization: Bearer <token>` format

### S3 Upload Fails
- Verify presigned URL hasn't expired (15-minute expiry)
- Check S3 bucket permissions
- Ensure bucket name is correct

### SQS Queue Empty
- Check S3 Upload Lambda logs for errors
- Verify S3 event notification is configured
- Check Lambda permissions to send to SQS

### Processor Lambda Not Triggered
- Verify SQS event source mapping is configured
- Check Lambda permissions to consume from SQS
- Review CloudWatch logs for errors

### DynamoDB Query Returns Empty
- Wait a few seconds for processing to complete
- Verify table name is correct
- Check that essay_id matches what was sent to SQS

### Metrics Not Updated
- Wait for Aggregation Lambda to process (may take 30-60 seconds)
- Check EssayUpdateQueue for messages
- Review Aggregation Lambda logs

---

## Quick Reference: Resource Names

- **Cognito User Pool:** `vincent-vocab-teachers-pool`
- **Cognito Client:** `vincent-vocab-teachers-client`
- **S3 Bucket:** `vincent-vocab-essays-<account-id>-<region>`
- **SQS Queue:** `vincent-vocab-essay-processing-queue`
- **S3 Upload Lambda:** `vincent-vocab-s3-upload-lambda`
- **Processor Lambda:** `vincent-vocab-processor-lambda`
- **Aggregation Lambda:** `vincent-vocab-aggregation-lambda`
- **EssayMetrics Table:** `VincentVocabEssayMetrics`
- **ClassMetrics Table:** `VincentVocabClassMetrics`
- **StudentMetrics Table:** `VincentVocabStudentMetrics`
- **Assignments Table:** `VincentVocabAssignments`
- **Students Table:** `VincentVocabStudents`

---

## Complete Test Script

Save this as `run_e2e_test.sh` and execute:

```bash
#!/bin/bash
set -e

# Source configuration
source <(cat <<EOF
export AWS_REGION="us-east-1"
export COGNITO_USER_POOL_ID="<YOUR_POOL_ID>"
export COGNITO_CLIENT_ID="<YOUR_CLIENT_ID>"
export TEACHER_EMAIL="teacher@example.com"
export TEACHER_PASSWORD="YourSecurePassword123!"
export API_URL="https://<api-id>.execute-api.us-east-1.amazonaws.com/prod"
export ESSAYS_BUCKET="vincent-vocab-essays-<account-id>-us-east-1"
export PROCESSING_QUEUE_URL="https://sqs.us-east-1.amazonaws.com/<account-id>/vincent-vocab-essay-processing-queue"
export S3_UPLOAD_LAMBDA="vincent-vocab-s3-upload-lambda"
export PROCESSOR_LAMBDA="vincent-vocab-processor-lambda"
export ESSAY_METRICS_TABLE="VincentVocabEssayMetrics"
export CLASS_METRICS_TABLE="VincentVocabClassMetrics"
export STUDENT_METRICS_TABLE="VincentVocabStudentMetrics"
EOF
)

echo "=== Step 1: Authenticate ==="
# ... (include all steps from above)

echo "=== E2E Test Complete ==="
```

---

## Summary

This guide validates the complete pipeline:

1. ✅ **Authentication** - Cognito JWT generation
2. ✅ **Assignment Creation** - API + DynamoDB
3. ✅ **Student Creation** - API + DynamoDB
4. ✅ **Presigned URL** - S3 permissions
5. ✅ **S3 Upload** - File storage
6. ✅ **S3 Trigger** - Event-driven Lambda
7. ✅ **SQS Queue** - Message queuing
8. ✅ **Processor Lambda** - Essay analysis (spaCy + Bedrock)
9. ✅ **DynamoDB Storage** - EssayMetrics persistence
10. ✅ **Essay Retrieval** - API read
11. ✅ **Class Metrics** - Aggregation and retrieval
12. ✅ **Student Metrics** - Aggregation and retrieval
13. ✅ **Override** - Teacher feedback override and recomputation

Each step can be executed independently to isolate issues in the pipeline.


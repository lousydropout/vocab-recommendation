# Essay Submission Script

Automated bash script to submit essays from the `data/` directory to the Vocabulary Analyzer pipeline.

## Overview

This script automates the complete essay submission workflow:
1. Authenticates with Cognito
2. Creates a new assignment
3. Creates students (Alex Johnson and Sam Williams)
4. Submits essays from `data/` directory:
   - `essay_1.txt` → Alex Johnson (basic vocabulary)
   - `essay_2.txt` → Sam Williams (advanced vocabulary)
   - `essay_3.txt` → Alex Johnson (basic vocabulary)
5. Optionally monitors processing and checks results

## Prerequisites

1. **AWS CLI** configured with appropriate credentials
2. **Dependencies installed:**
   - `aws` CLI
   - `curl`
   - `jq`
3. **Configuration** - See setup below

## Quick Start

### 1. Setup Configuration

**Option A: Use config file (recommended)**

```bash
# Copy the example config file
cp .e2e_config.example .e2e_config

# Edit with your values
nano .e2e_config
```

**Option B: Set environment variables**

```bash
export COGNITO_USER_POOL_ID="us-east-1_XXXXXXXXX"
export COGNITO_CLIENT_ID="your-client-id"
export TEACHER_EMAIL="teacher@example.com"
export TEACHER_PASSWORD="YourPassword123!"
export API_URL="https://xxx.execute-api.us-east-1.amazonaws.com/prod"
export ESSAYS_BUCKET="vincent-vocab-essays-account-id-us-east-1"
export PROCESSING_QUEUE_URL="https://sqs.us-east-1.amazonaws.com/account-id/vincent-vocab-essay-processing-queue"
```

### 2. Run the Script

```bash
./submit_essays.sh
```

The script will:
- Prompt for any missing configuration values
- Authenticate with Cognito
- Create assignment and students
- Upload all essays
- Optionally check results

## Configuration Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `AWS_REGION` | AWS region (default: us-east-1) | No |
| `COGNITO_USER_POOL_ID` | Cognito User Pool ID | Yes |
| `COGNITO_CLIENT_ID` | Cognito Client ID | Yes |
| `TEACHER_EMAIL` | Teacher email for authentication | Yes |
| `TEACHER_PASSWORD` | Teacher password | Yes |
| `API_URL` | API Gateway endpoint URL | Yes |
| `ESSAYS_BUCKET` | S3 bucket name for essays | Yes |
| `PROCESSING_QUEUE_URL` | SQS processing queue URL | Yes |

## Essay Mapping

The script automatically maps essays to students:

- **essay_1.txt** → Alex Johnson (Grade 10, basic vocabulary)
- **essay_2.txt** → Sam Williams (Grade 11, advanced vocabulary)  
- **essay_3.txt** → Alex Johnson (Grade 10, basic vocabulary)

## Output Files

After running, the script creates:

- `.jwt_token` - JWT token for API calls (for convenience)
- `.submission_info` - Assignment and student IDs with quick command examples

## Example Usage

```bash
# Run with interactive prompts
./submit_essays.sh

# Or with environment variables set
export COGNITO_USER_POOL_ID="us-east-1_ABC123"
export COGNITO_CLIENT_ID="xyz789"
# ... (set other vars)
./submit_essays.sh
```

## Checking Results

After submission, you can check results using the saved information:

```bash
# Load submission info
source .submission_info

# Check class metrics
curl -H "Authorization: Bearer $(cat .jwt_token)" \
  ${API_URL}/metrics/class/${ASSIGNMENT_ID} | jq

# Check student metrics
curl -H "Authorization: Bearer $(cat .jwt_token)" \
  ${API_URL}/metrics/student/${STUDENT_1_ID} | jq
```

## Monitoring Processing

Monitor Lambda logs to see processing in real-time:

```bash
# S3 Upload Trigger Lambda
aws logs tail /aws/lambda/vincent-vocab-s3-upload-lambda --follow

# Processor Lambda
aws logs tail /aws/lambda/vincent-vocab-processor-lambda --follow
```

## Troubleshooting

### Authentication Fails
- Verify Cognito User Pool ID and Client ID
- Check that USER_PASSWORD_AUTH is enabled for the client
- Verify teacher credentials

### Upload Fails
- Check S3 bucket permissions
- Verify presigned URL hasn't expired
- Check API Gateway endpoint is correct

### Essays Not Processing
- Check S3 Upload Lambda logs for errors
- Verify SQS queue is accessible
- Check Processor Lambda logs
- Ensure S3 event notifications are configured

### No Metrics Appearing
- Wait 30-60 seconds for processing to complete
- Check Aggregation Lambda logs
- Verify EssayUpdateQueue has messages

## Script Features

- ✅ **Color-coded output** for easy reading
- ✅ **Error handling** with clear error messages
- ✅ **Interactive prompts** for missing configuration
- ✅ **Automatic student creation** with appropriate grade levels
- ✅ **Essay-to-student mapping** based on vocabulary level
- ✅ **Optional result checking** after submission
- ✅ **Saves credentials** for later use (JWT token)

## Customization

To customize the script:

1. **Change student names/grades**: Edit the `create_students()` function
2. **Change essay mapping**: Edit the `essays` array in `submit_all_essays()`
3. **Add more essays**: Add entries to the `essays` array
4. **Change assignment name**: Modify the `create_assignment()` call in `main()`

## Related Files

- `BACKEND_E2E_TEST_GUIDE.md` - Complete manual testing guide
- `.e2e_config.example` - Configuration template
- `data/essay_*.txt` - Test essays


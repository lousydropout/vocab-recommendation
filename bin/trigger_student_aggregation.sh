#!/bin/bash
# Script to manually trigger student metrics aggregation for existing essays

set -e

# Script directory (bin/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Project root directory (parent of bin/)
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

TEACHER_ID="${1:-b4e85478-1001-70ba-9a0d-733fe615295e}"
STUDENT_ID="${2}"
QUEUE_URL="https://sqs.us-east-1.amazonaws.com/971422717446/vincent-vocab-essay-update-queue"

if [ -z "$STUDENT_ID" ]; then
    echo "Usage: $0 <teacher_id> <student_id>"
    echo "Example: $0 b4e85478-1001-70ba-9a0d-733fe615295e 29b537f2-a46d-41ae-925c-e0288ec7199f"
    exit 1
fi

echo "Triggering student metrics aggregation..."
echo "Teacher ID: $TEACHER_ID"
echo "Student ID: $STUDENT_ID"

aws sqs send-message \
    --queue-url "$QUEUE_URL" \
    --message-body "{\"teacher_id\":\"$TEACHER_ID\",\"student_id\":\"$STUDENT_ID\",\"assignment_id\":\"manual-trigger\",\"essay_id\":\"manual\"}" \
    --region us-east-1

echo "✓ Message sent to EssayUpdateQueue"
echo "Waiting 5 seconds for aggregation..."
sleep 5

echo "Check student metrics with:"
echo "curl -H \"Authorization: Bearer \$(cat ${PROJECT_ROOT}/.jwt_token)\" https://m18eg6bei9.execute-api.us-east-1.amazonaws.com/prod/metrics/student/$STUDENT_ID | jq"


#!/bin/bash
set -e

# ============================================================================
# Configuration
# ============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration (override with environment variables or command-line args)
AWS_REGION="${AWS_REGION:-us-east-1}"
COGNITO_USER_POOL_ID="${COGNITO_USER_POOL_ID:-}"
COGNITO_CLIENT_ID="${COGNITO_CLIENT_ID:-}"
TEACHER_EMAIL="${TEACHER_EMAIL:-}"
TEACHER_PASSWORD="${TEACHER_PASSWORD:-}"
API_URL="${API_URL:-}"
ESSAYS_BUCKET="${ESSAYS_BUCKET:-}"
PROCESSING_QUEUE_URL="${PROCESSING_QUEUE_URL:-}"

# Script directory (bin/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Project root directory (parent of bin/)
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ESSAYS_DIR="${PROJECT_ROOT}/essays/essays/prompt_1_2025-11-13"
PROMPTS_FILE="${PROJECT_ROOT}/essays/memory-bank/prompts.json"

# ============================================================================
# Helper Functions
# ============================================================================

print_section() {
    echo -e "\n${BLUE}=== $1 ===${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

check_dependencies() {
    local missing=()
    for cmd in aws curl jq; do
        if ! command -v $cmd &> /dev/null; then
            missing+=($cmd)
        fi
    done
    
    if [ ${#missing[@]} -ne 0 ]; then
        print_error "Missing required commands: ${missing[*]}"
        print_info "Please install: ${missing[*]}"
        exit 1
    fi
    print_success "All dependencies available"
}

# ============================================================================
# Configuration Loading
# ============================================================================

load_config() {
    print_section "Configuration"
    
    # Check if config file exists
    if [ -f "${PROJECT_ROOT}/.e2e_config" ]; then
        print_info "Loading configuration from .e2e_config"
        source "${PROJECT_ROOT}/.e2e_config"
    fi
    
    # Prompt for missing values
    if [ -z "$COGNITO_USER_POOL_ID" ]; then
        read -p "Enter Cognito User Pool ID: " COGNITO_USER_POOL_ID
    fi
    
    if [ -z "$COGNITO_CLIENT_ID" ]; then
        read -p "Enter Cognito Client ID: " COGNITO_CLIENT_ID
    fi
    
    if [ -z "$TEACHER_EMAIL" ]; then
        read -p "Enter Teacher Email: " TEACHER_EMAIL
    fi
    
    if [ -z "$TEACHER_PASSWORD" ]; then
        read -sp "Enter Teacher Password: " TEACHER_PASSWORD
        echo
    fi
    
    if [ -z "$API_URL" ]; then
        read -p "Enter API URL (e.g., https://xxx.execute-api.us-east-1.amazonaws.com/prod): " API_URL
    fi
    
    if [ -z "$ESSAYS_BUCKET" ]; then
        read -p "Enter S3 Essays Bucket name: " ESSAYS_BUCKET
    fi
    
    if [ -z "$PROCESSING_QUEUE_URL" ]; then
        read -p "Enter SQS Processing Queue URL: " PROCESSING_QUEUE_URL
    fi
    
    # Validate required values
    local required_vars=(
        "COGNITO_USER_POOL_ID"
        "COGNITO_CLIENT_ID"
        "TEACHER_EMAIL"
        "TEACHER_PASSWORD"
        "API_URL"
        "ESSAYS_BUCKET"
        "PROCESSING_QUEUE_URL"
    )
    
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            print_error "$var is required but not set"
            exit 1
        fi
    done
    
    print_success "Configuration loaded"
    echo "  Region: $AWS_REGION"
    echo "  API URL: $API_URL"
    echo "  Bucket: $ESSAYS_BUCKET"
    echo "  Essays Directory: $ESSAYS_DIR"
}

# ============================================================================
# Prompt Loading
# ============================================================================

load_prompt() {
    print_section "Loading Prompt"
    
    if [ ! -f "$PROMPTS_FILE" ]; then
        print_error "Prompts file not found: $PROMPTS_FILE"
        exit 1
    fi
    
    # Extract prompt with ID 1
    PROMPT_TEXT=$(jq -r '.prompts[] | select(.id == 1) | .prompt_text' "$PROMPTS_FILE")
    PROMPT_DATE=$(jq -r '.prompts[] | select(.id == 1) | .created_date' "$PROMPTS_FILE")
    PROMPT_DIR=$(jq -r '.prompts[] | select(.id == 1) | .essay_directory' "$PROMPTS_FILE")
    
    if [ -z "$PROMPT_TEXT" ] || [ "$PROMPT_TEXT" == "null" ]; then
        print_error "Prompt with ID 1 not found in $PROMPTS_FILE"
        exit 1
    fi
    
    print_success "Prompt loaded"
    echo "  Prompt ID: 1"
    echo "  Date: $PROMPT_DATE"
    echo "  Directory: $PROMPT_DIR"
    echo "  Text: ${PROMPT_TEXT:0:80}..."
    
    # Create assignment title (truncate if too long, max 100 chars)
    if [ ${#PROMPT_TEXT} -gt 100 ]; then
        ASSIGNMENT_TITLE="${PROMPT_TEXT:0:97}..."
    else
        ASSIGNMENT_TITLE="$PROMPT_TEXT"
    fi
    
    ASSIGNMENT_DESCRIPTION="Generated from mock essays - $PROMPT_TEXT"
}

# ============================================================================
# Essay Discovery
# ============================================================================

discover_essays() {
    print_section "Discovering Essays"
    
    if [ ! -d "$ESSAYS_DIR" ]; then
        print_error "Essays directory not found: $ESSAYS_DIR"
        exit 1
    fi
    
    # Find all .txt files in the directory
    mapfile -t ESSAY_FILES < <(find "$ESSAYS_DIR" -name "*.txt" -type f | sort)
    
    if [ ${#ESSAY_FILES[@]} -eq 0 ]; then
        print_error "No essay files found in $ESSAYS_DIR"
        exit 1
    fi
    
    print_success "Found ${#ESSAY_FILES[@]} essay files"
    
    # Display essay files
    for i in "${!ESSAY_FILES[@]}"; do
        local file_name=$(basename "${ESSAY_FILES[$i]}")
        echo "  $((i+1)). $file_name"
    done
    
    # Expected 15 essays
    if [ ${#ESSAY_FILES[@]} -ne 15 ]; then
        print_warning "Expected 15 essays, found ${#ESSAY_FILES[@]}"
    fi
}

# ============================================================================
# Authentication
# ============================================================================

authenticate() {
    print_section "Step 1: Authenticating with Cognito"
    
    local auth_response
    auth_response=$(aws cognito-idp initiate-auth \
        --region "$AWS_REGION" \
        --auth-flow USER_PASSWORD_AUTH \
        --client-id "$COGNITO_CLIENT_ID" \
        --auth-parameters "USERNAME=$TEACHER_EMAIL,PASSWORD=$TEACHER_PASSWORD" \
        --output json \
        2>&1)
    
    if [ $? -ne 0 ]; then
        print_error "Authentication failed"
        echo "$auth_response"
        exit 1
    fi
    
    TEACHER_JWT=$(echo "$auth_response" | jq -r '.AuthenticationResult.IdToken')
    
    if [ "$TEACHER_JWT" == "null" ] || [ -z "$TEACHER_JWT" ]; then
        print_error "Failed to extract JWT token"
        echo "$auth_response"
        exit 1
    fi
    
    print_success "Authentication successful"
    
    # Extract teacher_id from JWT (optional, for reference)
    TEACHER_ID=$(echo "$TEACHER_JWT" | cut -d. -f2 | sed 's/-/+/g; s/_/\//g' | base64 -d 2>/dev/null | jq -r '.sub' 2>/dev/null || echo "")
    if [ -n "$TEACHER_ID" ] && [ "$TEACHER_ID" != "null" ]; then
        echo "  Teacher ID: $TEACHER_ID"
    fi
}

# ============================================================================
# Assignment Creation
# ============================================================================

create_assignment() {
    print_section "Step 2: Creating Assignment"
    
    local assignment_name="${1:-$ASSIGNMENT_TITLE}"
    local assignment_desc="${2:-$ASSIGNMENT_DESCRIPTION}"
    
    local response
    response=$(curl -s -X POST "${API_URL}/assignments" \
        -H "Authorization: Bearer ${TEACHER_JWT}" \
        -H "Content-Type: application/json" \
        -d "{
            \"name\": \"${assignment_name}\",
            \"description\": \"${assignment_desc}\"
        }")
    
    if [ $? -ne 0 ]; then
        print_error "Failed to create assignment"
        echo "$response"
        exit 1
    fi
    
    ASSIGNMENT_ID=$(echo "$response" | jq -r '.assignment_id')
    
    if [ "$ASSIGNMENT_ID" == "null" ] || [ -z "$ASSIGNMENT_ID" ]; then
        print_error "Failed to extract assignment_id"
        echo "$response"
        exit 1
    fi
    
    print_success "Assignment created"
    echo "  Assignment ID: $ASSIGNMENT_ID"
    echo "  Name: $assignment_name"
}

# ============================================================================
# Essay Upload
# ============================================================================

upload_essay() {
    local essay_file="$1"
    local file_name=$(basename "$essay_file")
    
    print_info "Uploading essay: $file_name"
    
    # Step 1: Get presigned URL
    local upload_url_response
    upload_url_response=$(curl -s -X POST "${API_URL}/assignments/${ASSIGNMENT_ID}/upload-url" \
        -H "Authorization: Bearer ${TEACHER_JWT}" \
        -H "Content-Type: application/json" \
        -d "{
            \"file_name\": \"${file_name}\"
        }")
    
    if [ $? -ne 0 ]; then
        print_error "Failed to get presigned URL for $file_name"
        return 1
    fi
    
    local presigned_url
    presigned_url=$(echo "$upload_url_response" | jq -r '.presigned_url')
    local file_key
    file_key=$(echo "$upload_url_response" | jq -r '.file_key')
    
    if [ "$presigned_url" == "null" ] || [ -z "$presigned_url" ]; then
        print_error "Failed to extract presigned URL"
        echo "$upload_url_response"
        return 1
    fi
    
    # Step 2: Upload file to S3
    local upload_response
    upload_response=$(curl -s --upload-file "$essay_file" "$presigned_url")
    
    if [ $? -ne 0 ]; then
        print_error "Failed to upload $file_name to S3"
        return 1
    fi
    
    print_success "Essay uploaded: $file_name"
    echo "  File Key: $file_key"
    
    return 0
}

submit_all_essays() {
    print_section "Step 3: Submitting Essays"
    
    print_info "Students will be auto-created via name extraction from essay text"
    print_info "Processing ${#ESSAY_FILES[@]} essays..."
    
    local uploaded_count=0
    local failed_count=0
    
    for essay_file in "${ESSAY_FILES[@]}"; do
        if [ ! -f "$essay_file" ]; then
            print_warning "Essay file not found: $essay_file"
            failed_count=$((failed_count + 1))
            continue
        fi
        
        if upload_essay "$essay_file"; then
            uploaded_count=$((uploaded_count + 1))
            print_success "Submitted: $(basename "$essay_file")"
        else
            failed_count=$((failed_count + 1))
            print_error "Failed to submit: $(basename "$essay_file")"
        fi
        
        # Small delay to avoid rate limiting
        sleep 1
    done
    
    echo
    print_info "Upload Summary:"
    echo "  Successful: $uploaded_count"
    echo "  Failed: $failed_count"
    
    if [ $failed_count -gt 0 ]; then
        print_warning "$failed_count essay(s) failed to upload"
    fi
}

# ============================================================================
# Verification
# ============================================================================

verify_students_created() {
    print_section "Step 4: Verifying Students Created"
    
    print_info "Waiting 10 seconds for S3 trigger to process uploads..."
    sleep 10
    
    # Query students table
    local students_response
    students_response=$(aws dynamodb scan \
        --table-name VincentVocabStudents \
        --filter-expression "teacher_id = :tid" \
        --expression-attribute-values "{\":tid\":{\"S\":\"$TEACHER_ID\"}}" \
        --region "$AWS_REGION" \
        --output json 2>/dev/null)
    
    if [ $? -ne 0 ]; then
        print_warning "Failed to query students table (may need to wait longer)"
        return 1
    fi
    
    local student_count
    student_count=$(echo "$students_response" | jq -r '.Items | length // 0')
    
    print_info "Students found: $student_count (expected: ${#ESSAY_FILES[@]})"
    
    if [ -z "$student_count" ] || [ "$student_count" -eq 0 ]; then
        print_warning "No students found yet. They may still be processing."
        print_info "Students are auto-created by S3 trigger Lambda when essays are uploaded"
        return 1
    fi
    
    # List student names
    echo "$students_response" | jq -r '.Items[] | "  - \(.name.S)"' | sort
    
    if [ "$student_count" -ge "${#ESSAY_FILES[@]}" ]; then
        print_success "All students created successfully"
        return 0
    else
        print_warning "Only $student_count students found, expected ${#ESSAY_FILES[@]}"
        print_info "Some students may still be processing. Wait a bit longer and check again."
        return 1
    fi
}

verify_essays_processed() {
    print_section "Step 5: Verifying Essays Processed"
    
    print_info "Checking essay processing status..."
    
    # Query essay metrics table for this assignment
    # Note: Current table uses essay_id as partition key, assignment_id is a regular attribute
    # We need to scan and filter by assignment_id
    local essay_count=0
    local processed_count=0
    
    # Scan for essays with this assignment_id
    local essays_response
    essays_response=$(aws dynamodb scan \
        --table-name VincentVocabEssays \
        --filter-expression "assignment_id = :aid" \
        --expression-attribute-values "{\":aid\":{\"S\":\"$ASSIGNMENT_ID\"}}" \
        --region "$AWS_REGION" \
        --output json 2>/dev/null)
    
    if [ $? -eq 0 ] && [ -n "$essays_response" ]; then
        essay_count=$(echo "$essays_response" | jq -r '.Items | length // 0')
        processed_count=$(echo "$essays_response" | jq -r '[.Items[]? | select(.status.S == "processed")] | length // 0')
    fi
    
    print_info "Essays found: $essay_count"
    print_info "Essays processed: $processed_count"
    
    if [ "$essay_count" -eq 0 ]; then
        print_warning "No essays found yet. Processing may still be in progress."
        print_info "Processing typically takes 30-60 seconds per essay"
        return 1
    fi
    
    if [ "$processed_count" -eq "$essay_count" ] && [ "$essay_count" -ge "${#ESSAY_FILES[@]}" ]; then
        print_success "All essays processed successfully"
        return 0
    else
        print_warning "Processing incomplete: $processed_count/$essay_count essays processed"
        print_info "Wait longer for processing to complete"
        return 1
    fi
}

# ============================================================================
# Monitoring
# ============================================================================

monitor_processing() {
    print_section "Step 6: Monitoring Processing"
    
    print_info "Processing may take 30-60 seconds per essay..."
    print_info "You can monitor logs with:"
    echo "  aws logs tail /aws/lambda/vincent-vocab-s3-upload-lambda --follow --region $AWS_REGION"
    echo "  aws logs tail /ecs/vocab-processor --follow --region $AWS_REGION"
    echo
    
    read -p "Wait for processing? (y/n, default: n): " wait_processing
    if [[ "$wait_processing" =~ ^[Yy]$ ]]; then
        print_info "Waiting 90 seconds for initial processing..."
        sleep 90
        
        print_info "Checking SQS queue status..."
        local queue_attrs
        queue_attrs=$(aws sqs get-queue-attributes \
            --queue-url "$PROCESSING_QUEUE_URL" \
            --attribute-names ApproximateNumberOfMessages \
            --region "$AWS_REGION" 2>/dev/null)
        
        if [ $? -eq 0 ]; then
            local msg_count
            msg_count=$(echo "$queue_attrs" | jq -r '.Attributes.ApproximateNumberOfMessages // 0')
            echo "  Messages in queue: $msg_count"
        fi
        
        # Run verification
        verify_students_created
        verify_essays_processed
    fi
}

# ============================================================================
# Results Summary
# ============================================================================

check_results() {
    print_section "Step 7: Checking Results (Optional)"
    
    read -p "Check results now? (y/n, default: n): " check_now
    if [[ ! "$check_now" =~ ^[Yy]$ ]]; then
        return 0
    fi
    
    print_info "Waiting 10 seconds for initial processing..."
    sleep 10
    
    # Check assignment
    print_info "Fetching assignment details..."
    local assignment_response
    assignment_response=$(curl -s -X GET "${API_URL}/assignments/${ASSIGNMENT_ID}" \
        -H "Authorization: Bearer ${TEACHER_JWT}")
    
    if [ $? -eq 0 ]; then
        echo "$assignment_response" | jq '.'
    fi
    
    # Check class metrics
    print_info "Fetching class metrics..."
    local class_metrics
    class_metrics=$(curl -s -X GET "${API_URL}/metrics/class/${ASSIGNMENT_ID}" \
        -H "Authorization: Bearer ${TEACHER_JWT}")
    
    if [ $? -eq 0 ]; then
        local essay_count
        essay_count=$(echo "$class_metrics" | jq -r '.stats.essay_count // 0')
        echo "  Essays processed: $essay_count"
        if [ "$essay_count" -gt 0 ]; then
            echo "$class_metrics" | jq '.stats'
        else
            print_warning "No essays processed yet. Metrics may take 30-60 seconds to appear."
        fi
    fi
}

show_summary() {
    print_section "Submission Summary"
    
    echo "Assignment Details:"
    echo "  Assignment ID: $ASSIGNMENT_ID"
    echo "  API URL: $API_URL"
    echo "  Prompt: ${ASSIGNMENT_TITLE:0:60}..."
    echo
    
    echo "Essays Submitted:"
    echo "  Total: ${#ESSAY_FILES[@]} essays"
    for essay_file in "${ESSAY_FILES[@]}"; do
        echo "  - $(basename "$essay_file")"
    done
    echo
    
    print_info "Next Steps:"
    echo "  1. Monitor processing: aws logs tail /ecs/vocab-processor --follow"
    echo "  2. Check class metrics: curl -H \"Authorization: Bearer \$TEACHER_JWT\" ${API_URL}/metrics/class/${ASSIGNMENT_ID}"
    echo "  3. View assignment: curl -H \"Authorization: Bearer \$TEACHER_JWT\" ${API_URL}/assignments/${ASSIGNMENT_ID}"
    echo "  4. Verify students: aws dynamodb scan --table-name VincentVocabStudents --filter-expression \"teacher_id = :tid\" --expression-attribute-values '{\":tid\":{\"S\":\"$TEACHER_ID\"}}' --region $AWS_REGION | jq"
    echo
    
    # Save important info to file
    cat > "${PROJECT_ROOT}/.mock_submission_info" <<EOF
# Mock Essay Submission Information
# Generated: $(date)

ASSIGNMENT_ID="$ASSIGNMENT_ID"
API_URL="$API_URL"
TEACHER_ID="$TEACHER_ID"
ESSAY_COUNT="${#ESSAY_FILES[@]}"

# Quick commands:
# Check class metrics:
# curl -H "Authorization: Bearer \$(cat ${PROJECT_ROOT}/.jwt_token)" ${API_URL}/metrics/class/${ASSIGNMENT_ID} | jq

# Check students:
# aws dynamodb scan --table-name VincentVocabStudents --filter-expression "teacher_id = :tid" --expression-attribute-values "{\":tid\":{\"S\":\"$TEACHER_ID\"}}" --region $AWS_REGION | jq

# Check essays:
# aws dynamodb scan --table-name VincentVocabEssays --filter-expression "assignment_id = :aid" --expression-attribute-values "{\":aid\":{\"S\":\"$ASSIGNMENT_ID\"}}" --region $AWS_REGION | jq
EOF
    
    # Save JWT to file for later use (optional)
    echo "$TEACHER_JWT" > "${PROJECT_ROOT}/.jwt_token" 2>/dev/null || true
    print_info "Information saved:"
    echo "  JWT token: ${PROJECT_ROOT}/.jwt_token"
    echo "  Submission info: ${PROJECT_ROOT}/.mock_submission_info"
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
    echo "=========================================="
    echo "  Mock Essay Submission Script"
    echo "  Vocabulary Analyzer Pipeline"
    echo "=========================================="
    echo
    
    # Check dependencies
    check_dependencies
    
    # Load configuration
    load_config
    
    # Load prompt
    load_prompt
    
    # Discover essays
    discover_essays
    
    # Authenticate
    authenticate
    
    # Create assignment
    create_assignment
    
    # Submit essays (students will be auto-created)
    submit_all_essays
    
    # Monitor (optional)
    monitor_processing
    
    # Check results (optional)
    check_results
    
    # Show summary
    show_summary
    
    print_success "Script completed successfully!"
}

# Run main function
main "$@"


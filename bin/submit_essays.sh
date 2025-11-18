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
DATA_DIR="${PROJECT_ROOT}/data"

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
    
    local assignment_name="${1:-Vocabulary Analysis Assignment}"
    local assignment_desc="${2:-Automated test assignment for essay submission}"
    
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
# Student Management
# ============================================================================

create_student() {
    local name="$1"
    local grade_level="${2:-10}"
    local notes="${3:-}"
    
    local response
    response=$(curl -s -X POST "${API_URL}/students" \
        -H "Authorization: Bearer ${TEACHER_JWT}" \
        -H "Content-Type: application/json" \
        -d "{
            \"name\": \"${name}\",
            \"grade_level\": ${grade_level},
            \"notes\": \"${notes}\"
        }")
    
    if [ $? -ne 0 ]; then
        print_error "Failed to create student: $name"
        echo "$response"
        return 1
    fi
    
    local student_id
    student_id=$(echo "$response" | jq -r '.student_id')
    
    if [ "$student_id" == "null" ] || [ -z "$student_id" ]; then
        print_error "Failed to extract student_id for: $name"
        echo "$response"
        return 1
    fi
    
    echo "$student_id"
}

create_students() {
    print_section "Step 3: Creating Students"
    
    # Create students for the essays
    # Student 1: Basic vocabulary (essay_1.txt, essay_3.txt)
    print_info "Creating student: Alex Johnson (Grade 10, Basic vocabulary)"
    STUDENT_1_ID=$(create_student "Alex Johnson" 10 "Basic vocabulary level")
    if [ -n "$STUDENT_1_ID" ]; then
        print_success "Created student: Alex Johnson (ID: $STUDENT_1_ID)"
    fi
    
    # Student 2: Advanced vocabulary (essay_2.txt)
    print_info "Creating student: Sam Williams (Grade 11, Advanced vocabulary)"
    STUDENT_2_ID=$(create_student "Sam Williams" 11 "Advanced vocabulary level")
    if [ -n "$STUDENT_2_ID" ]; then
        print_success "Created student: Sam Williams (ID: $STUDENT_2_ID)"
    fi
    
    # Store student IDs in array for easy access
    STUDENT_IDS=("$STUDENT_1_ID" "$STUDENT_2_ID")
    STUDENT_NAMES=("Alex Johnson" "Sam Williams")
}

# ============================================================================
# Essay Upload
# ============================================================================

upload_essay() {
    local essay_file="$1"
    local student_id="$2"
    local student_name="$3"
    local file_name=$(basename "$essay_file")
    
    print_info "Uploading essay: $file_name for student: $student_name"
    
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
    echo "  Student: $student_name"
    
    return 0
}

submit_all_essays() {
    print_section "Step 4: Submitting Essays"
    
    # Map essays to students
    # essay_1.txt -> Alex Johnson (basic)
    # essay_2.txt -> Sam Williams (advanced)
    # essay_3.txt -> Alex Johnson (basic)
    
    local essays=(
        "${DATA_DIR}/essay_1.txt:${STUDENT_1_ID}:Alex Johnson"
        "${DATA_DIR}/essay_2.txt:${STUDENT_2_ID}:Sam Williams"
        "${DATA_DIR}/essay_3.txt:${STUDENT_1_ID}:Alex Johnson"
    )
    
    local uploaded_count=0
    local failed_count=0
    
    for essay_mapping in "${essays[@]}"; do
        IFS=':' read -r essay_file student_id student_name <<< "$essay_mapping"
        
        if [ ! -f "$essay_file" ]; then
            print_warning "Essay file not found: $essay_file"
            failed_count=$((failed_count + 1))
            continue
        fi
        
        if [ -z "$student_id" ] || [ "$student_id" == "null" ]; then
            print_warning "Invalid student_id for: $essay_file"
            failed_count=$((failed_count + 1))
            continue
        fi
        
        if upload_essay "$essay_file" "$student_id" "$student_name"; then
            uploaded_count=$((uploaded_count + 1))
            print_success "Submitted: $(basename "$essay_file") → $student_name"
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
}

# ============================================================================
# Monitoring
# ============================================================================

monitor_processing() {
    print_section "Step 5: Monitoring Processing"
    
    print_info "Processing may take 30-60 seconds per essay..."
    print_info "You can monitor logs with:"
    echo "  aws logs tail /aws/lambda/vincent-vocab-s3-upload-lambda --follow --region $AWS_REGION"
    echo "  aws logs tail /aws/lambda/vincent-vocab-processor-lambda --follow --region $AWS_REGION"
    echo
    
    read -p "Wait for processing? (y/n, default: n): " wait_processing
    if [[ "$wait_processing" =~ ^[Yy]$ ]]; then
        print_info "Waiting 60 seconds for initial processing..."
        sleep 60
        
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
    fi
}

# ============================================================================
# Results Summary
# ============================================================================

check_results() {
    print_section "Step 6: Checking Results (Optional)"
    
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
    
    # Check student metrics
    for i in "${!STUDENT_IDS[@]}"; do
        local student_id="${STUDENT_IDS[$i]}"
        local student_name="${STUDENT_NAMES[$i]}"
        
        print_info "Fetching metrics for: $student_name"
        local student_metrics
        student_metrics=$(curl -s -X GET "${API_URL}/metrics/student/${student_id}" \
            -H "Authorization: Bearer ${TEACHER_JWT}")
        
        if [ $? -eq 0 ]; then
            local total_essays
            total_essays=$(echo "$student_metrics" | jq -r '.stats.total_essays // 0')
            echo "  Total essays: $total_essays"
            if [ "$total_essays" -gt 0 ]; then
                echo "$student_metrics" | jq '.stats'
            fi
        fi
    done
}

show_summary() {
    print_section "Submission Summary"
    
    echo "Assignment Details:"
    echo "  Assignment ID: $ASSIGNMENT_ID"
    echo "  API URL: $API_URL"
    echo
    
    echo "Students Created:"
    for i in "${!STUDENT_IDS[@]}"; do
        echo "  ${STUDENT_NAMES[$i]}: ${STUDENT_IDS[$i]}"
    done
    echo
    
    echo "Essays Submitted:"
    echo "  essay_1.txt → Alex Johnson"
    echo "  essay_2.txt → Sam Williams"
    echo "  essay_3.txt → Alex Johnson"
    echo
    
    print_info "Next Steps:"
    echo "  1. Monitor processing: aws logs tail /aws/lambda/vincent-vocab-processor-lambda --follow"
    echo "  2. Check class metrics: curl -H \"Authorization: Bearer \$TEACHER_JWT\" ${API_URL}/metrics/class/${ASSIGNMENT_ID}"
    echo "  3. Check student metrics: curl -H \"Authorization: Bearer \$TEACHER_JWT\" ${API_URL}/metrics/student/<student_id>"
    echo "  4. View assignment: curl -H \"Authorization: Bearer \$TEACHER_JWT\" ${API_URL}/assignments/${ASSIGNMENT_ID}"
    echo
    
    # Save important info to file
    cat > "${PROJECT_ROOT}/.submission_info" <<EOF
# Submission Information
# Generated: $(date)

ASSIGNMENT_ID="$ASSIGNMENT_ID"
API_URL="$API_URL"
STUDENT_1_ID="$STUDENT_1_ID"
STUDENT_2_ID="$STUDENT_2_ID"
STUDENT_1_NAME="Alex Johnson"
STUDENT_2_NAME="Sam Williams"

# Quick commands:
# Check class metrics:
# curl -H "Authorization: Bearer \$(cat ${PROJECT_ROOT}/.jwt_token)" ${API_URL}/metrics/class/${ASSIGNMENT_ID} | jq

# Check student 1 metrics:
# curl -H "Authorization: Bearer \$(cat ${PROJECT_ROOT}/.jwt_token)" ${API_URL}/metrics/student/${STUDENT_1_ID} | jq

# Check student 2 metrics:
# curl -H "Authorization: Bearer \$(cat ${PROJECT_ROOT}/.jwt_token)" ${API_URL}/metrics/student/${STUDENT_2_ID} | jq
EOF
    
    # Save JWT to file for later use (optional)
    echo "$TEACHER_JWT" > "${PROJECT_ROOT}/.jwt_token" 2>/dev/null || true
    print_info "Information saved:"
    echo "  JWT token: ${PROJECT_ROOT}/.jwt_token"
    echo "  Submission info: ${PROJECT_ROOT}/.submission_info"
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
    echo "=========================================="
    echo "  Essay Submission Script"
    echo "  Vocabulary Analyzer Pipeline"
    echo "=========================================="
    echo
    
    # Check dependencies
    check_dependencies
    
    # Load configuration
    load_config
    
    # Authenticate
    authenticate
    
    # Create assignment
    create_assignment "Vocabulary Analysis Assignment - $(date +%Y-%m-%d)" \
        "Automated assignment created by submit_essays.sh script"
    
    # Create students
    create_students
    
    # Submit essays
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


#!/bin/bash
# Script to submit a single essay for a student and monitor its processing
# Usage: ./bin/submit_and_monitor_essay.sh [assignment_id] [student_id] [essay_file_path]

set -e

# Script directory (bin/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Project root directory (parent of bin/)
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Load configuration
if [ -f "${PROJECT_ROOT}/.e2e_config" ]; then
    source "${PROJECT_ROOT}/.e2e_config"
fi

API_URL="${API_URL:-https://m18eg6bei9.execute-api.us-east-1.amazonaws.com/prod}"
ASSIGNMENT_ID="${1:-}"
STUDENT_ID="${2:-}"
ESSAY_FILE="${3:-}"

# Check for JWT token
if [ ! -f "${PROJECT_ROOT}/.jwt_token" ]; then
    echo -e "${RED}✗ JWT token not found${NC}"
    echo -e "${YELLOW}Run ./bin/get_jwt_token.sh first${NC}"
    exit 1
fi

TEACHER_JWT=$(cat "${PROJECT_ROOT}/.jwt_token")

# Get assignment ID if not provided
if [ -z "$ASSIGNMENT_ID" ]; then
    if [ -f "${PROJECT_ROOT}/.submission_info" ]; then
        ASSIGNMENT_ID=$(grep "^ASSIGNMENT_ID=" "${PROJECT_ROOT}/.submission_info" | cut -d'"' -f2)
    fi
    if [ -z "$ASSIGNMENT_ID" ]; then
        read -p "Enter Assignment ID: " ASSIGNMENT_ID
    fi
fi

# Get student ID if not provided
if [ -z "$STUDENT_ID" ]; then
    read -p "Enter Student ID: " STUDENT_ID
fi

# Get essay file if not provided
if [ -z "$ESSAY_FILE" ]; then
    ESSAY_FILE="${PROJECT_ROOT}/essays/essays/prompt_1_2025-11-13/Brooks_Jackson.txt"
fi

if [ ! -f "$ESSAY_FILE" ]; then
    echo -e "${RED}✗ Essay file not found: $ESSAY_FILE${NC}"
    exit 1
fi

ESSAY_TEXT=$(cat "$ESSAY_FILE")
FILENAME=$(basename "$ESSAY_FILE")

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Submit & Monitor Essay${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Assignment ID: ${BLUE}${ASSIGNMENT_ID}${NC}"
echo "Student ID: ${BLUE}${STUDENT_ID}${NC}"
echo "Essay File: ${BLUE}${FILENAME}${NC}"
echo ""

# Step 1: Submit essay
echo -e "${YELLOW}Step 1: Submitting essay...${NC}"
SUBMIT_RESPONSE=$(curl -s -X POST "${API_URL}/essays/batch" \
    -H "Authorization: Bearer ${TEACHER_JWT}" \
    -H "Content-Type: application/json" \
    -d "{
        \"assignment_id\": \"${ASSIGNMENT_ID}\",
        \"student_id\": \"${STUDENT_ID}\",
        \"essays\": [{
            \"filename\": \"${FILENAME}\",
            \"text\": $(echo "$ESSAY_TEXT" | jq -Rs .)
        }]
    }")

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Failed to submit essay${NC}"
    exit 1
fi

ESSAY_ID=$(echo "$SUBMIT_RESPONSE" | jq -r '.[0].essay_id // empty' 2>/dev/null || echo "")

if [ -z "$ESSAY_ID" ] || [ "$ESSAY_ID" == "null" ]; then
    echo -e "${RED}✗ Failed to extract essay_id${NC}"
    echo "$SUBMIT_RESPONSE" | jq '.' 2>/dev/null || echo "$SUBMIT_RESPONSE"
    exit 1
fi

echo -e "${GREEN}✓ Essay submitted${NC}"
echo "  Essay ID: ${BLUE}${ESSAY_ID}${NC}"
echo "  Status: ${YELLOW}pending${NC}"
echo ""

# Step 2: Monitor processing
echo -e "${YELLOW}Step 2: Monitoring processing...${NC}"
echo "  (This may take 10-60 seconds)"
echo ""

MAX_ATTEMPTS=30
ATTEMPT=0
POLL_INTERVAL=2

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    ATTEMPT=$((ATTEMPT + 1))
    
    GET_RESPONSE=$(curl -s -X GET "${API_URL}/essays/${ESSAY_ID}" \
        -H "Authorization: Bearer ${TEACHER_JWT}")
    
    STATUS=$(echo "$GET_RESPONSE" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
    
    if [ "$STATUS" == "processed" ]; then
        echo -e "${GREEN}✓ Essay processed successfully!${NC}"
        echo ""
        echo -e "${BLUE}========================================${NC}"
        echo -e "${BLUE}  Results${NC}"
        echo -e "${BLUE}========================================${NC}"
        echo ""
        
        # Display vocabulary analysis
        VOCAB_ANALYSIS=$(echo "$GET_RESPONSE" | jq -r '.vocabulary_analysis // empty' 2>/dev/null)
        if [ -n "$VOCAB_ANALYSIS" ] && [ "$VOCAB_ANALYSIS" != "null" ]; then
            echo -e "${GREEN}Vocabulary Analysis:${NC}"
            echo ""
            
            CORRECTNESS=$(echo "$GET_RESPONSE" | jq -r '.vocabulary_analysis.correctness_review // "N/A"' 2>/dev/null)
            echo -e "${YELLOW}Overall Review:${NC}"
            echo "$CORRECTNESS"
            echo ""
            
            VOCAB_USED=$(echo "$GET_RESPONSE" | jq -r '.vocabulary_analysis.vocabulary_used[]? // empty' 2>/dev/null | tr '\n' ', ' | sed 's/, $//')
            if [ -n "$VOCAB_USED" ]; then
                echo -e "${BLUE}Vocabulary Demonstrating Current Level:${NC}"
                echo "$VOCAB_USED"
                echo ""
            fi
            
            RECOMMENDED=$(echo "$GET_RESPONSE" | jq -r '.vocabulary_analysis.recommended_vocabulary[]? // empty' 2>/dev/null | tr '\n' ', ' | sed 's/, $//')
            if [ -n "$RECOMMENDED" ]; then
                echo -e "${BLUE}Recommended Vocabulary:${NC}"
                echo "$RECOMMENDED"
                echo ""
            fi
        fi
        
        echo -e "${YELLOW}Full JSON Response:${NC}"
        echo "$GET_RESPONSE" | jq '.' 2>/dev/null || echo "$GET_RESPONSE"
        exit 0
    elif [ "$STATUS" == "pending" ]; then
        echo -e "  Attempt ${ATTEMPT}/${MAX_ATTEMPTS}: Still processing... (status: ${STATUS})"
        sleep $POLL_INTERVAL
    else
        echo -e "${YELLOW}  Status: ${STATUS}${NC}"
        sleep $POLL_INTERVAL
    fi
done

echo -e "${RED}✗ Timeout: Essay did not complete processing within ${MAX_ATTEMPTS} attempts${NC}"
echo "  Last status: ${STATUS}"
echo "  Check manually: curl -H \"Authorization: Bearer \$(cat ${PROJECT_ROOT}/.jwt_token)\" ${API_URL}/essays/${ESSAY_ID}"
exit 1


#!/bin/bash
# Script to get assignment and student information
# Usage: ./bin/get_assignment_info.sh [assignment_id]

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

# Load configuration from .e2e_config if it exists
if [ -f "${PROJECT_ROOT}/.e2e_config" ]; then
    source "${PROJECT_ROOT}/.e2e_config"
fi

# Default values
API_URL="${API_URL:-https://m18eg6bei9.execute-api.us-east-1.amazonaws.com/prod}"
ASSIGNMENT_ID="${1:-}"

# Try to get assignment ID from .submission_info if not provided
if [ -z "$ASSIGNMENT_ID" ] && [ -f "${PROJECT_ROOT}/.submission_info" ]; then
    ASSIGNMENT_ID=$(grep "^ASSIGNMENT_ID=" "${PROJECT_ROOT}/.submission_info" | cut -d'"' -f2)
fi

if [ -z "$ASSIGNMENT_ID" ]; then
    read -p "Enter Assignment ID: " ASSIGNMENT_ID
fi

# Check for JWT token
if [ ! -f "${PROJECT_ROOT}/.jwt_token" ]; then
    echo -e "${RED}✗ JWT token not found${NC}"
    echo -e "${YELLOW}Run ./bin/get_jwt_token.sh first to authenticate${NC}"
    exit 1
fi

TEACHER_JWT=$(cat "${PROJECT_ROOT}/.jwt_token")

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Assignment Information${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Get assignment details
echo -e "${YELLOW}Fetching assignment details...${NC}"
assignment_response=$(curl -s -X GET "${API_URL}/assignments/${ASSIGNMENT_ID}" \
    -H "Authorization: Bearer ${TEACHER_JWT}")

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Failed to fetch assignment${NC}"
    exit 1
fi

# Check for errors
error_msg=$(echo "$assignment_response" | jq -r '.message // empty' 2>/dev/null || echo "")
if [ -n "$error_msg" ]; then
    echo -e "${RED}✗ Error: $error_msg${NC}"
    if [[ "$error_msg" == *"expired"* ]]; then
        echo -e "${YELLOW}Token expired. Run ./bin/get_jwt_token.sh to get a new token${NC}"
    fi
    exit 1
fi

# Display assignment info
assignment_title=$(echo "$assignment_response" | jq -r '.title // .name // "N/A"' 2>/dev/null || echo "N/A")
assignment_desc=$(echo "$assignment_response" | jq -r '.description // "N/A"' 2>/dev/null || echo "N/A")

echo -e "${GREEN}Assignment:${NC}"
echo "  ID: ${BLUE}${ASSIGNMENT_ID}${NC}"
echo "  Title: ${BLUE}${assignment_title}${NC}"
if [ "$assignment_desc" != "N/A" ] && [ -n "$assignment_desc" ]; then
    echo "  Description: ${assignment_desc}"
fi
echo ""

# Get class metrics to see students
echo -e "${YELLOW}Fetching class metrics...${NC}"
metrics_response=$(curl -s -X GET "${API_URL}/metrics/class/${ASSIGNMENT_ID}" \
    -H "Authorization: Bearer ${TEACHER_JWT}")

if [ $? -eq 0 ]; then
    error_msg=$(echo "$metrics_response" | jq -r '.message // empty' 2>/dev/null || echo "")
    if [ -z "$error_msg" ]; then
        essay_count=$(echo "$metrics_response" | jq -r '.stats.essay_count // 0' 2>/dev/null || echo "0")
        echo -e "${GREEN}Class Metrics:${NC}"
        echo "  Essays: ${BLUE}${essay_count}${NC}"
        echo ""
    fi
fi

# Try to get students from .submission_info
if [ -f "${PROJECT_ROOT}/.submission_info" ]; then
    echo -e "${GREEN}Students (from submission info):${NC}"
    if grep -q "STUDENT_1_NAME" "${PROJECT_ROOT}/.submission_info"; then
        student1_name=$(grep "^STUDENT_1_NAME=" "${PROJECT_ROOT}/.submission_info" | cut -d'"' -f2)
        student1_id=$(grep "^STUDENT_1_ID=" "${PROJECT_ROOT}/.submission_info" | cut -d'"' -f2)
        echo "  1. ${BLUE}${student1_name}${NC} (ID: ${student1_id})"
    fi
    if grep -q "STUDENT_2_NAME" "${PROJECT_ROOT}/.submission_info"; then
        student2_name=$(grep "^STUDENT_2_NAME=" "${PROJECT_ROOT}/.submission_info" | cut -d'"' -f2)
        student2_id=$(grep "^STUDENT_2_ID=" "${PROJECT_ROOT}/.submission_info" | cut -d'"' -f2)
        echo "  2. ${BLUE}${student2_name}${NC} (ID: ${student2_id})"
    fi
    echo ""
fi

echo -e "${YELLOW}Full assignment JSON:${NC}"
echo "$assignment_response" | jq '.' 2>/dev/null || echo "$assignment_response"


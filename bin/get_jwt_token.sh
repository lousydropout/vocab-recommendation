#!/bin/bash
# Script to authenticate with Cognito and save JWT token
# Usage: ./bin/get_jwt_token.sh [email] [password]

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
AWS_REGION="${AWS_REGION:-us-east-1}"
COGNITO_USER_POOL_ID="${COGNITO_USER_POOL_ID:-}"
COGNITO_CLIENT_ID="${COGNITO_CLIENT_ID:-}"
TEACHER_EMAIL="${1:-${TEACHER_EMAIL:-}}"
TEACHER_PASSWORD="${2:-${TEACHER_PASSWORD:-}}"

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

echo -e "${BLUE}Authenticating with Cognito...${NC}"

# Authenticate
auth_response=$(aws cognito-idp initiate-auth \
    --region "$AWS_REGION" \
    --auth-flow USER_PASSWORD_AUTH \
    --client-id "$COGNITO_CLIENT_ID" \
    --auth-parameters "USERNAME=$TEACHER_EMAIL,PASSWORD=$TEACHER_PASSWORD" \
    --output json \
    2>&1)

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Authentication failed${NC}"
    echo "$auth_response"
    exit 1
fi

TEACHER_JWT=$(echo "$auth_response" | jq -r '.AuthenticationResult.IdToken')

if [ "$TEACHER_JWT" == "null" ] || [ -z "$TEACHER_JWT" ]; then
    echo -e "${RED}✗ Failed to extract JWT token${NC}"
    echo "$auth_response"
    exit 1
fi

# Save JWT to file
echo "$TEACHER_JWT" > "${PROJECT_ROOT}/.jwt_token"
echo -e "${GREEN}✓ Authentication successful${NC}"
echo -e "  JWT token saved to: ${PROJECT_ROOT}/.jwt_token"

# Extract teacher_id from JWT (optional, for reference)
TEACHER_ID=$(echo "$TEACHER_JWT" | cut -d. -f2 | sed 's/-/+/g; s/_/\//g' | base64 -d 2>/dev/null | jq -r '.sub' 2>/dev/null || echo "")
if [ -n "$TEACHER_ID" ] && [ "$TEACHER_ID" != "null" ]; then
    echo -e "  Teacher ID: ${BLUE}${TEACHER_ID}${NC}"
fi

echo ""
echo -e "${YELLOW}You can now use the token with:${NC}"
echo "  export TEACHER_JWT=\$(cat ${PROJECT_ROOT}/.jwt_token)"
echo ""
echo -e "${YELLOW}Or use it directly in curl commands:${NC}"
echo "  curl -H \"Authorization: Bearer \$(cat ${PROJECT_ROOT}/.jwt_token)\" <API_URL>"


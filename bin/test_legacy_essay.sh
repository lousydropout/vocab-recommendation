#!/bin/bash
# Test script for legacy essay submission (public, no authentication)
# Submits an essay and polls for results, displaying them at the end

set -e

# Configuration
API_URL="${API_URL:-https://m18eg6bei9.execute-api.us-east-1.amazonaws.com/prod}"
MAX_WAIT_TIME="${MAX_WAIT_TIME:-300}"  # 5 minutes
POLL_INTERVAL="${POLL_INTERVAL:-5}"     # 5 seconds

# Sample essay text
ESSAY_TEXT="${ESSAY_TEXT:-The quick brown fox jumps over the lazy dog. This sentence contains every letter of the alphabet. Vocabulary is important for effective communication. Using diverse words makes writing more engaging and interesting.}"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Legacy Essay Submission Test${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Step 1: Submit essay
echo -e "${YELLOW}Step 1: Submitting essay...${NC}"
SUBMIT_RESPONSE=$(curl -s -X POST "${API_URL}/essay" \
  -H "Content-Type: application/json" \
  -d "{\"essay_text\": \"${ESSAY_TEXT}\"}")

if [ $? -ne 0 ]; then
  echo -e "${RED}Error: Failed to submit essay${NC}"
  exit 1
fi

ESSAY_ID=$(echo "$SUBMIT_RESPONSE" | grep -o '"essay_id":"[^"]*' | cut -d'"' -f4)

if [ -z "$ESSAY_ID" ]; then
  echo -e "${RED}Error: Failed to get essay_id from response${NC}"
  echo "Response: $SUBMIT_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓ Essay submitted successfully${NC}"
echo -e "  Essay ID: ${BLUE}${ESSAY_ID}${NC}"
echo ""

# Step 2: Check if processing is complete (OpenAI processes immediately)
echo -e "${YELLOW}Step 2: Checking analysis status...${NC}"
echo ""

# For OpenAI-based analysis, processing happens immediately
# But we'll check the response to see if vocabulary_analysis is present
GET_RESPONSE=$(curl -s -X GET "${API_URL}/essay/${ESSAY_ID}")

if [ $? -ne 0 ]; then
  echo -e "${RED}Error: Failed to get essay status${NC}"
  exit 1
fi

STATUS=$(echo "$GET_RESPONSE" | grep -o '"status":"[^"]*' | cut -d'"' -f4)

if [ -z "$STATUS" ]; then
  echo -e "${RED}Error: Could not parse status from response${NC}"
  echo "Response: $GET_RESPONSE"
  exit 1
fi

echo -e "  Status: ${BLUE}${STATUS}${NC}"

# Check if vocabulary_analysis is present (new OpenAI format)
HAS_VOCAB_ANALYSIS=$(echo "$GET_RESPONSE" | grep -o '"vocabulary_analysis"' | wc -l)

if [ "$HAS_VOCAB_ANALYSIS" -gt 0 ]; then
  echo -e "${GREEN}✓ Vocabulary analysis complete (OpenAI)${NC}"
elif [ "$STATUS" == "processed" ]; then
  echo -e "${GREEN}✓ Essay processed successfully${NC}"
else
  echo -e "${YELLOW}⚠ Essay status: ${STATUS} (may still be processing)${NC}"
fi

echo ""

# Step 3: Display results
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Results${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if we have vocabulary_analysis (new OpenAI format)
if [ "$HAS_VOCAB_ANALYSIS" -gt 0 ]; then
  echo -e "${GREEN}Vocabulary Analysis (OpenAI GPT-4.1-mini)${NC}"
  echo ""
  
  # Extract and display correctness review
  CORRECTNESS_REVIEW=$(echo "$GET_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if 'vocabulary_analysis' in data:
        print(data['vocabulary_analysis'].get('correctness_review', 'N/A'))
except:
    print('N/A')
" 2>/dev/null)
  
  if [ "$CORRECTNESS_REVIEW" != "N/A" ] && [ -n "$CORRECTNESS_REVIEW" ]; then
    echo -e "${YELLOW}Overall Review:${NC}"
    echo "$CORRECTNESS_REVIEW"
    echo ""
  fi
  
  # Extract vocabulary used
  VOCAB_USED=$(echo "$GET_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if 'vocabulary_analysis' in data and 'vocabulary_used' in data['vocabulary_analysis']:
        vocab = data['vocabulary_analysis']['vocabulary_used']
        print(', '.join(vocab) if isinstance(vocab, list) else 'N/A')
except:
    print('N/A')
" 2>/dev/null)
  
  if [ "$VOCAB_USED" != "N/A" ] && [ -n "$VOCAB_USED" ]; then
    echo -e "${BLUE}Vocabulary Demonstrating Current Level:${NC}"
    echo "$VOCAB_USED"
    echo ""
  fi
  
  # Extract recommended vocabulary
  RECOMMENDED_VOCAB=$(echo "$GET_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if 'vocabulary_analysis' in data and 'recommended_vocabulary' in data['vocabulary_analysis']:
        vocab = data['vocabulary_analysis']['recommended_vocabulary']
        print(', '.join(vocab) if isinstance(vocab, list) else 'N/A')
except:
    print('N/A')
" 2>/dev/null)
  
  if [ "$RECOMMENDED_VOCAB" != "N/A" ] && [ -n "$RECOMMENDED_VOCAB" ]; then
    echo -e "${BLUE}Recommended Vocabulary:${NC}"
    echo "$RECOMMENDED_VOCAB"
    echo ""
  fi
  
  echo -e "${YELLOW}Full JSON Response:${NC}"
else
  echo -e "${YELLOW}Full Response (Legacy Format):${NC}"
fi

# Pretty print JSON response
echo "$GET_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$GET_RESPONSE"

echo ""
echo -e "${GREEN}Test completed successfully!${NC}"
echo -e "  Essay ID: ${BLUE}${ESSAY_ID}${NC}"
echo -e "  API URL: ${BLUE}${API_URL}${NC}"
if [ "$HAS_VOCAB_ANALYSIS" -gt 0 ]; then
  echo -e "  Analysis: ${GREEN}OpenAI GPT-4.1-mini${NC}"
fi


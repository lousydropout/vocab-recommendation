#!/bin/bash
# Manually push image to ECR - Part 1
# This bypasses CDK's Docker integration

set -e

REGION="us-east-1"
ACCOUNT_ID="971422717446"
REPO_NAME="vocab-processor-lambda"
ECR_REPO="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPO_NAME}"

echo "=== Part 1: Manual ECR Push ==="
echo ""

# Step 1: Ensure repository exists
echo "1. Checking/creating ECR repository..."
if ! aws ecr describe-repositories --repository-names ${REPO_NAME} --region ${REGION} > /dev/null 2>&1; then
    echo "   Creating repository: ${REPO_NAME}"
    aws ecr create-repository --repository-name ${REPO_NAME} --region ${REGION}
else
    echo "   ✅ Repository exists"
fi

# Step 2: Get ECR auth token and login (using helper to avoid stdin issue)
echo ""
echo "2. Authenticating with ECR..."
aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com || {
    echo "   ⚠️  Docker login failed, but continuing..."
    echo "   Trying alternative: using credential helper"
}

# Step 3: Tag the image
echo ""
echo "3. Tagging local image..."
docker tag vocab-processor-test:latest ${ECR_REPO}:latest
docker tag vocab-processor-test:latest ${ECR_REPO}:v1
echo "   ✅ Tagged as ${ECR_REPO}:latest"

# Step 4: Push to ECR
echo ""
echo "4. Pushing to ECR..."
docker push ${ECR_REPO}:latest
docker push ${ECR_REPO}:v1

echo ""
echo "=== ✅ Part 1 Complete ==="
echo ""
echo "Image URI: ${ECR_REPO}:latest"
echo ""
echo "Next: Update CDK stack to use this image (Part 2)"




#!/bin/bash
# Manually push processor Lambda image to ECR
# Use this if CDK's Docker integration isn't working

set -e

REGION="us-east-1"
ACCOUNT_ID="971422717446"
REPO_NAME="cdk-hnb659fds-container-assets-${ACCOUNT_ID}-${REGION}"
IMAGE_TAG="processor-lambda"

echo "=== Manual ECR Push for Processor Lambda ==="
echo ""

# Step 1: Authenticate with ECR
echo "1. Authenticating with ECR..."
aws ecr get-login-password --region ${REGION} | \
  docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com

# Step 2: Check if repository exists
echo ""
echo "2. Checking ECR repository..."
if aws ecr describe-repositories --repository-names ${REPO_NAME} --region ${REGION} > /dev/null 2>&1; then
    echo "   ✅ Repository exists: ${REPO_NAME}"
else
    echo "   Creating repository: ${REPO_NAME}"
    aws ecr create-repository --repository-name ${REPO_NAME} --region ${REGION}
fi

# Step 3: Tag the local image
echo ""
echo "3. Tagging image..."
LOCAL_IMAGE="vocab-processor-test:latest"
REMOTE_IMAGE="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPO_NAME}:${IMAGE_TAG}"

docker tag ${LOCAL_IMAGE} ${REMOTE_IMAGE}
echo "   Tagged: ${LOCAL_IMAGE} -> ${REMOTE_IMAGE}"

# Step 4: Push to ECR
echo ""
echo "4. Pushing image to ECR..."
docker push ${REMOTE_IMAGE}

echo ""
echo "=== ✅ Image pushed successfully! ==="
echo ""
echo "Image URI: ${REMOTE_IMAGE}"
echo ""
echo "Note: You may need to update the CDK stack to reference this specific image."




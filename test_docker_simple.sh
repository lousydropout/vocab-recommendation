#!/bin/bash
# Simple Docker test - just check if we can pull the base image
echo "Testing Docker connectivity..."
if docker pull public.ecr.aws/lambda/python:3.12 > /dev/null 2>&1; then
    echo "✅ Can pull base image"
    exit 0
else
    echo "❌ Cannot pull base image - Docker API issue"
    exit 1
fi

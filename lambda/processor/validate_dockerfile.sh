#!/bin/bash
# Validate Dockerfile structure and dependencies

set -e

echo "Validating Dockerfile and Lambda function..."
echo ""

# Check Dockerfile exists
if [ ! -f "Dockerfile" ]; then
    echo "❌ Dockerfile not found"
    exit 1
fi
echo "✅ Dockerfile exists"

# Check required files exist
if [ ! -f "lambda_function.py" ]; then
    echo "❌ lambda_function.py not found"
    exit 1
fi
echo "✅ lambda_function.py exists"

if [ ! -f "requirements.txt" ]; then
    echo "❌ requirements.txt not found"
    exit 1
fi
echo "✅ requirements.txt exists"

# Check Dockerfile structure
echo ""
echo "Checking Dockerfile structure..."
if grep -q "FROM public.ecr.aws/lambda/python:3.12" Dockerfile; then
    echo "✅ Uses correct base image"
else
    echo "❌ Wrong base image"
    exit 1
fi

if grep -q "spacy" Dockerfile; then
    echo "✅ Installs spaCy"
else
    echo "❌ Missing spaCy installation"
    exit 1
fi

if grep -q "en_core_web_sm" Dockerfile; then
    echo "✅ Downloads spaCy model"
else
    echo "❌ Missing model download"
    exit 1
fi

if grep -q "lambda_function.handler" Dockerfile; then
    echo "✅ Sets correct handler"
else
    echo "❌ Wrong handler"
    exit 1
fi

# Check Python syntax
echo ""
echo "Checking Python syntax..."
if python3 -m py_compile lambda_function.py 2>/dev/null; then
    echo "✅ lambda_function.py syntax is valid"
else
    echo "❌ Syntax error in lambda_function.py"
    exit 1
fi

# Check requirements.txt
echo ""
echo "Checking requirements.txt..."
if grep -q "boto3" requirements.txt; then
    echo "✅ boto3 in requirements"
else
    echo "❌ Missing boto3"
    exit 1
fi

if grep -q "spacy" requirements.txt; then
    echo "✅ spacy in requirements"
else
    echo "⚠️  spacy not in requirements (installed in Dockerfile, which is OK)"
fi

echo ""
echo "=========================================="
echo "✅ All validations passed!"
echo "=========================================="
echo ""
echo "Dockerfile structure is correct."
echo "Note: Actual Docker build requires Docker to be working."
echo "The Docker API issue needs to be resolved before deployment."




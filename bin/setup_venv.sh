#!/bin/bash
# Setup Python virtual environment for local development

set -e

# Script directory (bin/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Project root directory (parent of bin/)
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [ ! -d "${PROJECT_ROOT}/venv" ]; then
    echo "Creating virtual environment..."
    if command -v python3 &> /dev/null; then
        # Try to create venv
        if python3 -m venv "${PROJECT_ROOT}/venv" 2>/dev/null; then
            echo "Virtual environment created successfully"
        else
            echo "Error: python3-venv not installed."
            echo "Install with: sudo apt install python3.10-venv"
            echo ""
            echo "Note: For Lambda layer builds, Docker is used instead of venv."
            echo "The venv is only needed for local Python development/testing."
            exit 1
        fi
    else
        echo "Error: python3 not found"
        exit 1
    fi
else
    echo "Virtual environment already exists"
fi

echo "Activating virtual environment..."
source "${PROJECT_ROOT}/venv/bin/activate"

echo "Upgrading pip..."
pip install --upgrade pip

echo "Virtual environment ready!"
echo "To activate: source ${PROJECT_ROOT}/venv/bin/activate"
echo ""
echo "Note: Lambda functions use Docker for dependency bundling during CDK deployment."
echo "The venv is for local development only."


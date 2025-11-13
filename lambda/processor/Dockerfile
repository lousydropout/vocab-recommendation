FROM python:3.12-slim

WORKDIR /app

# Install system dependencies if needed for spaCy
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install spaCy model (compatible with spacy 3.7.2)
# Using direct pip install for the model package
RUN pip install --no-cache-dir https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.7.1/en_core_web_sm-3.7.1-py3-none-any.whl

# Copy worker code
COPY lambda_function.py .

# Run worker (unbuffered output for CloudWatch logs)
CMD ["python", "-u", "lambda_function.py"]




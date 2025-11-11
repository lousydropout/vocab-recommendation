# Vocabulary Essay Analyzer (PoC)

A serverless AWS application that processes student essays to evaluate vocabulary diversity, difficulty, and contextual correctness using spaCy NLP and AWS Bedrock (Claude 3).

## Overview

This proof-of-concept demonstrates an automated pipeline that:
- Accepts essay uploads via REST API
- Processes essays asynchronously using spaCy for lexical analysis
- Evaluates word-level correctness using AWS Bedrock LLM
- Returns structured reports with metrics and feedback

## Architecture

- **API Layer**: API Gateway + Lambda (Python/FastAPI)
- **Storage**: S3 (essay files) + DynamoDB (status and results)
- **Processing**: Lambda (Python) with spaCy + Bedrock
- **Queue**: SQS for async processing
- **Infrastructure**: AWS CDK (TypeScript)

See [`memory-bank/architecture.md`](memory-bank/architecture.md) for detailed architecture documentation.

## Project Structure

```
vocab_recommendation/
├── bin/                    # CDK app entry point
├── lib/                    # CDK stack definitions
├── lambda/                 # Python Lambda functions
│   ├── api/               # FastAPI handler
│   ├── s3_upload_trigger/ # S3 event trigger
│   └── processor/         # Essay processing (Docker container)
├── frontend/               # React frontend application
├── memory-bank/            # Project documentation and decisions
└── test/                   # Unit tests
```

## Memory Bank

Project knowledge, architecture decisions, and implementation notes are stored in [`memory-bank/`](memory-bank/). This includes:

- **Architecture**: System design and component overview
- **Requirements**: Product requirements and specifications
- **Decisions**: Technical decision log with rationale
- **Data Models**: DynamoDB schemas and data structures
- **API Spec**: Endpoint documentation
- **Implementation Notes**: Development details and gotchas

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- AWS CLI configured
- AWS CDK CLI: `npm install -g aws-cdk`
- Python 3.12
- Docker (for building Lambda layers)

### Installation

```bash
# Install CDK dependencies
npm install

# Build TypeScript
npm run build
```

### Frontend Development

The frontend is a React application built with Vite:

```bash
cd frontend
npm install
npm run dev
```

See [`frontend/README.md`](frontend/README.md) for detailed frontend documentation.

### Deployment

```bash
# Bootstrap CDK (first time only)
cdk bootstrap

# Deploy stack
cdk deploy

# View stack outputs (API URL, etc.)
cdk outputs
```

## Development

### Useful Commands

* `npm run build`   - Compile TypeScript to JavaScript
* `npm run watch`   - Watch for changes and compile
* `npm run test`    - Run unit tests
* `npx cdk deploy`  - Deploy stack to AWS
* `npx cdk diff`    - Compare deployed stack with current state
* `npx cdk synth`   - Emit CloudFormation template

### Local Testing

```bash
# Test API Lambda locally (requires AWS credentials)
cd lambda/api
pip install -r requirements.txt
python -m pytest

# Test processor Lambda
cd ../processor
pip install -r requirements.txt
python -m pytest
```

## API Endpoints

- `POST /essay` - Upload essay and start processing
- `GET /essay/{essay_id}` - Retrieve analysis results

See [`memory-bank/api-spec.md`](memory-bank/api-spec.md) for detailed API documentation.

## Status

✅ **Epic 1-4 Complete** - Following the task list in Epic 1-5:
- [x] Epic 1: Infrastructure Setup (AWS CDK) ✅ **COMPLETE**
  - All AWS resources deployed (S3, DynamoDB, SQS, IAM roles)
  - 25 unit tests passing
  - Stack deployed to `us-east-1`
- [x] Epic 2: API Layer (FastAPI + Mangum) ✅ **COMPLETE**
  - API Lambda and S3 trigger Lambda deployed
  - API Gateway configured with 3 endpoints
  - 6/6 API integration tests passing
  - API URL: `https://m18eg6bei9.execute-api.us-east-1.amazonaws.com/prod/`
- [x] Epic 3: Processing Pipeline (spaCy + Bedrock) ✅ **COMPLETE**
  - Processor Lambda deployed as Docker container
  - spaCy NLP analysis and Bedrock LLM integration working
  - End-to-end processing test passing (~37s processing time)
  - All bugs fixed (DynamoDB compatibility)
- [x] Epic 4: Frontend (React + Tailwind) ✅ **COMPLETE**
  - React application with essay upload interface
  - Real-time processing status with polling
  - Metrics and feedback display
  - Ready for deployment
- [ ] Epic 5: Observability

## License

[Add license information]

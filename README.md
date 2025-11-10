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
│   └── processor/         # Essay processing logic
├── layers/                 # Lambda layers (spaCy)
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

### Building spaCy Lambda Layer

```bash
cd layers/spacy
chmod +x build_layer.sh
./build_layer.sh
cd ../..
```

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

🚧 **In Development** - Following the task list in Epic 1-5:
- [ ] Epic 1: Infrastructure Setup (AWS CDK)
- [ ] Epic 2: API Layer (FastAPI + Mangum)
- [ ] Epic 3: Processing Pipeline (spaCy + Bedrock)
- [ ] Epic 4: Frontend (React + Tailwind + shadcn/ui)
- [ ] Epic 5: Observability

## License

[Add license information]

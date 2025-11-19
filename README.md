# Vocabulary Essay Analyzer (PoC)

A serverless AWS application that processes student essays to evaluate vocabulary diversity, difficulty, and contextual correctness using OpenAI GPT-4.1-mini.

## Overview

This proof-of-concept demonstrates an automated pipeline that:

- Accepts essay uploads via REST API
- Processes essays asynchronously using OpenAI GPT-4.1-mini for vocabulary analysis
- Provides vocabulary feedback, correctness reviews, and recommendations
- Returns structured reports with metrics and feedback

## Architecture

- **API Layer**: API Gateway + Lambda (Python/FastAPI)
- **Storage**: DynamoDB (essays, students, assignments, teachers, metrics)
- **Processing**: Lambda Worker (Python) with OpenAI GPT-4.1-mini - Triggered by SQS
- **Queue**: SQS for async processing
- **Infrastructure**: AWS CDK (TypeScript)

**Processing Pipeline**: `API → SQS → Worker Lambda (OpenAI) → DynamoDB`

See [`memory-bank/architecture.md`](memory-bank/architecture.md) for detailed architecture documentation.

## Project Structure

```
vocab_recommendation/
├── bin/                    # CDK app entry point
├── lib/                    # CDK stack definitions
├── lambda/                 # Python Lambda functions
│   ├── api/               # FastAPI handler
│   └── worker/            # Essay processing worker (OpenAI integration)
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

- Bun (JavaScript runtime and package manager)
- AWS CLI configured
- AWS CDK CLI: `bun install -g aws-cdk` (or `npm install -g aws-cdk` if CDK doesn't support Bun yet)
- Python 3.12
- Docker (for building Lambda layers and container images)

### Installation

```bash
# Install CDK dependencies
bun install

# Build TypeScript
bun run build
```

### Frontend Development

The frontend is a React application built with Vite:

```bash
cd frontend
bun install
bun run dev
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

- `bun run build` - Compile TypeScript to JavaScript
- `bun run watch` - Watch for changes and compile
- `bun run test` - Run unit tests
- `bunx cdk deploy` - Deploy stack to AWS (or `npx cdk deploy`)
- `bunx cdk diff` - Compare deployed stack with current state (or `npx cdk diff`)
- `bunx cdk synth` - Emit CloudFormation template (or `npx cdk synth`)

### Local Testing

**Note:** Use a Python virtual environment for local testing.

```bash
# Setup virtual environment (first time)
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip

# Test API Lambda
cd lambda/api
pip install -r requirements.txt
PYTHONPATH=. pytest -v

# Test worker Lambda
cd ../worker
pip install -r requirements.txt
PYTHONPATH=. pytest -v
```

See `lambda/api/tests/README.md` for detailed test setup instructions.

## API Endpoints

The API provides comprehensive endpoints for managing students, assignments, essays, and analytics:

**Core Endpoints:**

- `GET /health` - Health check (public)
- `GET /auth/health` - Authentication health check

**Students:**

- `POST /students` - Create student
- `GET /students` - List all students
- `GET /students/{student_id}` - Get student details
- `PATCH /students/{student_id}` - Update student
- `DELETE /students/{student_id}` - Delete student

**Assignments:**

- `POST /assignments` - Create assignment
- `GET /assignments` - List all assignments
- `GET /assignments/{assignment_id}` - Get assignment details
- `POST /assignments/{assignment_id}/upload-url` - Get presigned URL for upload

**Essays:**

- `POST /essays/batch` - Batch upload essays
- `POST /essays/public` - Public demo essay upload (no auth)
- `GET /essays/{essay_id}` - Get essay and analysis results
- `GET /essays/assignment/{assignment_id}` - List essays for assignment
- `GET /essays/student/{student_id}` - List essays for student
- `PATCH /essays/{essay_id}/override` - Override AI feedback
- `DELETE /essays/{essay_id}` - Delete essay

**Analytics:**

- `GET /metrics/class/{assignment_id}` - Class-level metrics
- `GET /metrics/student/{student_id}` - Student-level metrics
- `GET /metrics/assignment/{assignment_id}/student/{student_id}` - Assignment-scoped student metrics

See [`memory-bank/api-spec.md`](memory-bank/api-spec.md) for detailed API documentation with request/response examples.

## Status

✅ **Epic 1-8 Complete (Backend)** - Core functionality implemented and deployed:

- [x] Epic 1: Infrastructure Setup (AWS CDK) ✅ **COMPLETE**
  - All AWS resources deployed (S3, DynamoDB, SQS, IAM roles)
  - 25 unit tests passing
  - Stack deployed to `us-east-1`
- [x] Epic 2: API Layer (FastAPI + Mangum) ✅ **COMPLETE**
  - API Lambda and S3 trigger Lambda deployed
  - API Gateway configured with multiple endpoints
  - 6/6 API integration tests passing
  - API URL: `https://m18eg6bei9.execute-api.us-east-1.amazonaws.com/prod/`
- [x] Epic 3: Processing Pipeline (OpenAI GPT-4.1-mini) ✅ **COMPLETE**
  - Worker Lambda function for async essay processing
  - OpenAI GPT-4.1-mini integration for vocabulary analysis
  - Vocabulary feedback, correctness reviews, and recommendations
  - End-to-end processing working
- [x] Epic 4: Frontend (React + Tailwind) ✅ **COMPLETE**
  - React application with essay upload interface
  - Real-time processing status with polling
  - Metrics and feedback display
  - Ready for deployment
- [ ] Epic 5: Observability
- [x] Epic 6: Authentication & Teacher Management ✅ **COMPLETE (Backend)**
  - AWS Cognito integration
  - Teacher management endpoints
  - JWT-based authentication
- [x] Epic 7: Student & Assignment Management ✅ **COMPLETE (Backend)**
  - Student CRUD operations
  - Assignment management
  - Batch essay upload support
- [x] Epic 8: Analytics & Teacher Review Interface ✅ **COMPLETE (Backend)**
  - Class and student metrics endpoints
  - Essay override functionality
  - Analytics aggregation

See [`memory-bank/progress.md`](memory-bank/progress.md) for detailed progress tracking.

## License

[Add license information]

# Technical Decisions

## Decision Log

### D-001: Python for Lambda Functions
**Date**: 2025-01-XX  
**Status**: Accepted  
**Context**: Need spaCy for NLP analysis  
**Decision**: Use Python 3.12 for all Lambda functions  
**Rationale**: 
- spaCy has best Python support
- FastAPI + Mangum work well for API Lambdas
- Better ecosystem for NLP tasks

**Alternatives Considered**:
- Node.js: Limited NLP library support
- Java: Heavier runtime, less common for serverless

---

### D-002: Lambda Layers for spaCy Model
**Date**: 2025-01-XX  
**Status**: Accepted  
**Context**: spaCy model (en_core_web_sm) is ~50MB  
**Decision**: Package spaCy and model in Lambda Layer  
**Rationale**:
- Reduces Lambda package size
- Enables reuse across functions
- Faster deployments

**Alternatives Considered**:
- Container image: More complex, but fallback if layer size limits hit
- Download at runtime: Slower cold starts

---

### D-003: SQS for Async Processing
**Date**: 2025-01-XX  
**Status**: Accepted  
**Context**: Processing takes time (spaCy + Bedrock calls)  
**Decision**: Use SQS queue between S3 upload and processing  
**Rationale**:
- Decouples API from processing
- Built-in retry logic with DLQ
- Cost-effective for async workloads

**Alternatives Considered**:
- Direct S3 → Lambda: Less control over retries
- Step Functions: Overkill for PoC

---

### D-004: Docker Container for spaCy (Revised from D-002)
**Date**: 2025-11-10  
**Status**: Superseded by D-010  
**Context**: Lambda layer size limit (250MB unzipped) exceeded by spaCy + model  
**Decision**: Switch to Docker container image for Processor Lambda  
**Rationale**:
- Docker containers support larger dependencies (>10GB)
- spaCy + en_core_web_sm model fits comfortably
- CDK handles ECR image building automatically

**Alternatives Considered**:
- Lambda Layer: Size limit exceeded
- Download model at runtime: Too slow for cold starts

**Note**: This decision was superseded when Docker Lambda also exceeded the 250MB unzipped limit.

---

### D-010: ECS Fargate for Processing (Revised from D-004)
**Date**: 2025-01-XX  
**Status**: Accepted  
**Context**: Docker-based Lambda exceeded 250MB unzipped package size limit (spaCy + model + dependencies)  
**Decision**: Migrate Processor from Lambda to ECS Fargate worker service  
**Rationale**:
- ECS Fargate has no package size limits
- Long-running worker can continuously poll SQS (more efficient than Lambda event-driven)
- Same processing logic, no business logic changes
- Auto-scaling based on CPU utilization (1-2 tasks)
- Default VPC with public subnets (no NAT gateway needed)

**Implementation Details**:
- Worker continuously polls SQS with long-polling (20s wait time)
- Graceful shutdown on SIGTERM
- CloudWatch Logs integration
- Same IAM permissions as Lambda (SQS, DynamoDB, S3, Bedrock)
- Task resources: 2 vCPU, 4GB memory

**Alternatives Considered**:
- Docker Lambda: Still exceeds 250MB unzipped limit
- EC2: More complex, requires instance management
- Split model: Would require significant refactoring

---

### D-005: Two Processing Flows (Legacy vs Assignment)
**Date**: 2025-11-11  
**Status**: Accepted  
**Context**: Need to support both simple essay uploads and assignment-based batch uploads  
**Decision**: Implement two distinct processing flows:
1. **Legacy Flow**: `POST /essay` → `essays/{essay_id}.txt` → Simple SQS message
2. **Assignment Flow**: `POST /assignments/{id}/upload-url` → `{teacher_id}/assignments/{assignment_id}/...` → Student extraction → Full processing

**Rationale**:
- Maintains backward compatibility with existing `/essay` endpoint
- Enables new assignment-based features (student tracking, batch uploads)
- Clear separation of concerns
- S3 key path determines processing flow

**Implementation Details**:
- Legacy essays: Use existing `essay_id` from S3 key, no student matching
- Assignment essays: Extract student names, match/create students, generate new `essay_id`
- S3 trigger Lambda routes based on key prefix pattern

**Bug Fix (2025-11-11)**:
- Fixed legacy essay processing bug where `process_single_essay()` was incorrectly called
- Legacy essays now directly send SQS message with existing `essay_id`

---

### D-006: Bedrock Claude 3 Model
**Date**: 2025-01-XX  
**Status**: Accepted  
**Context**: Need LLM for word-level evaluation  
**Decision**: Use Claude 3 Sonnet via Bedrock  
**Rationale**:
- Managed service, no infrastructure
- Good balance of cost and quality
- Native AWS integration

**Alternatives Considered**:
- OpenAI API: External dependency, cost concerns
- Fine-tuned model: Overkill for PoC

---

### D-007: DynamoDB for State Management
**Date**: 2025-01-XX  
**Status**: Accepted  
**Context**: Need to track essay status and results  
**Decision**: Use DynamoDB with on-demand billing  
**Rationale**:
- Serverless, auto-scaling
- Fast lookups by essay_id
- Pay-per-request pricing good for PoC

**Alternatives Considered**:
- RDS: Overkill, requires VPC
- S3 + metadata: Slower queries

---

### D-008: Presigned URL for Uploads
**Date**: 2025-01-XX  
**Status**: Accepted  
**Context**: Need efficient file upload mechanism  
**Decision**: Support both direct upload and presigned URLs  
**Rationale**:
- Presigned URLs: Direct client-to-S3, reduces Lambda costs
- Direct upload: Simpler for small files
- Flexibility for different use cases

---

### D-009: Plain Text Input Only
**Date**: 2025-01-XX  
**Status**: Accepted  
**Context**: Simplify PoC scope  
**Decision**: Accept only plain text essays  
**Rationale**:
- Reduces complexity
- Focus on core NLP/LLM functionality
- Can extend later if needed

---

### D-011: Processor Lambda Dual Mode (Event-Driven + Worker)
**Date**: 2025-11-13  
**Status**: Accepted  
**Context**: Processor Lambda code supports both Lambda event-driven (SQS event source) and ECS worker (long-polling) modes  
**Decision**: Implement both `handler()` function for Lambda events and `main()` function for ECS worker  
**Rationale**:
- Maintains compatibility with existing SQS event source mapping
- Supports future migration to ECS Fargate if needed
- Same processing logic, different invocation patterns
- Allows gradual migration without breaking changes

**Implementation Details**:
- `handler(event, context)`: Processes SQS events from Lambda event source
- `main()`: Long-running worker loop for ECS Fargate (polls SQS continuously)
- Both use same `process_message()` function for actual processing
- Lambda automatically handles message deletion on success
- ECS worker manually deletes messages after processing

**Alternatives Considered**:
- Separate codebases: More maintenance overhead
- Lambda-only: Limited by package size constraints
- ECS-only: Requires immediate migration, breaks existing setup

---

### D-012: Real Data Over Mock Data for Student Analytics
**Date**: 2025-01-XX  
**Status**: Accepted  
**Context**: Student detail page was displaying fake time-series data (Week 1, Week 2, Week 3) generated by multiplying averages, which was misleading  
**Decision**: Replace all mock data with real essay data from API, require 2+ essays for trend calculation  
**Rationale**:
- Provides accurate, trustworthy data to teachers
- Better user experience with real dates and metrics
- Trend calculation with 2+ essays is more practical than requiring 6+
- Clear messaging when insufficient data exists

**Implementation Details**:
- Added `GET /essays/student/{student_id}` endpoint to fetch individual essays
- Time-series chart uses actual essay dates and metrics
- Trend calculation compares most recent essay to previous essay (5% threshold)
- Returns `null` trend when < 2 essays with explanatory message
- Chart only displays when 2+ essays exist

**Alternatives Considered**:
- Keep mock data: Misleading and reduces trust
- Require 6+ essays for trends: Too restrictive, most students won't have that many
- Hide trend entirely: Less informative, teachers want to see progress


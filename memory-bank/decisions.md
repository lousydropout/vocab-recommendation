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
**Status**: Accepted  
**Context**: Lambda layer size limit (250MB unzipped) exceeded by spaCy + model  
**Decision**: Switch to Docker container image for Processor Lambda  
**Rationale**:
- Docker containers support larger dependencies (>10GB)
- spaCy + en_core_web_sm model fits comfortably
- CDK handles ECR image building automatically

**Alternatives Considered**:
- Lambda Layer: Size limit exceeded
- Download model at runtime: Too slow for cold starts

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


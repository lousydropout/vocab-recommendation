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

### D-004: Bedrock Claude 3 Model
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

### D-005: DynamoDB for State Management
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

### D-006: Presigned URL for Uploads
**Date**: 2025-01-XX  
**Status**: Accepted  
**Context**: Need efficient file upload mechanism  
**Decision**: Support both direct upload and presigned URLs  
**Rationale**:
- Presigned URLs: Direct client-to-S3, reduces Lambda costs
- Direct upload: Simpler for small files
- Flexibility for different use cases

---

### D-007: Plain Text Input Only
**Date**: 2025-01-XX  
**Status**: Accepted  
**Context**: Simplify PoC scope  
**Decision**: Accept only plain text essays  
**Rationale**:
- Reduces complexity
- Focus on core NLP/LLM functionality
- Can extend later if needed


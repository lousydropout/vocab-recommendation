# Implementation Notes

## Project Structure

```
vocab_recommendation/
├── bin/
│   └── vocab_recommendation.ts          # CDK app entry
├── lib/
│   └── vocab_recommendation-stack.ts   # Main CDK stack ✅
├── test/
│   └── vocab_recommendation.test.ts    # CDK unit tests ✅
├── lambda/
│   ├── api/                             # ✅ Epic 2
│   │   ├── lambda_function.py
│   │   ├── app.py
│   │   └── requirements.txt
│   ├── s3_upload_trigger/               # ✅ Epic 2
│   │   ├── lambda_function.py
│   │   └── requirements.txt
│   └── processor/                       # ✅ Epic 3
│       ├── lambda_function.py
│       ├── processor.py
│       ├── requirements.txt
│       └── Dockerfile                   # Docker container for spaCy
├── frontend/                             # ✅ Epic 4
│   ├── src/
│   │   ├── components/ui/               # shadcn/ui components
│   │   ├── lib/                         # API client, utils
│   │   ├── App.tsx                      # Main application
│   │   └── test/                        # Test setup
│   ├── components.json                  # shadcn/ui config
│   └── package.json
├── test/
│   ├── vocab_recommendation.test.ts     # ✅ CDK unit tests
│   ├── test_api.py                      # ✅ API integration tests
│   └── test_processing.py              # ✅ End-to-end processing tests
├── memory-bank/                         # Project documentation
└── package.json                         # CDK dependencies (TypeScript)
```

## Key Implementation Details

### Docker Container for spaCy (Processor Lambda)

**Decision**: Switched from Lambda layer to Docker container due to size limits (spaCy + model > 250MB unzipped limit).

1. Dockerfile structure:
   ```dockerfile
   FROM public.ecr.aws/lambda/python:3.12
   RUN pip install --no-cache-dir spacy && \
       python -m spacy download en_core_web_sm
   COPY lambda_function.py requirements.txt /var/task/
   RUN pip install --no-cache-dir -r requirements.txt -t /var/task
   CMD ["lambda_function.handler"]
   ```

2. CDK deployment:
   - CDK automatically builds and pushes Docker image to ECR
   - Uses `lambda.DockerImageCode.fromImageAsset()`
   - Image is built during `cdk deploy`

3. In Lambda code:
   ```python
   import spacy
   nlp = spacy.load("en_core_web_sm")  # Model pre-installed in container
   ```

### Bedrock Integration

- **Model ID**: `anthropic.claude-3-sonnet-20240229-v1:0`
- **Region**: Must match stack region
- **IAM Permissions**: `bedrock:InvokeModel` on model ARN
- **API Format**: Bedrock Runtime API with Anthropic message format

### S3 Event Flow

**Two Processing Flows:**

1. **Legacy Flow** (`essays/{essay_id}.txt`):
   - Client uploads via `POST /essay` API
   - S3 key: `essays/{essay_id}.txt`
   - S3 triggers Lambda on `ObjectCreated` event
   - Lambda extracts existing `essay_id` from S3 key
   - Lambda sends message to SQS queue with existing `essay_id`
   - Processor Lambda consumes from SQS

2. **Assignment Flow** (`{teacher_id}/assignments/{assignment_id}/...`):
   - Client gets presigned URL via `POST /assignments/{id}/upload-url`
   - Client uploads file (single .txt/.md or .zip) to S3
   - S3 key: `{teacher_id}/assignments/{assignment_id}/{file_name}`
   - S3 triggers Lambda on `ObjectCreated` event
   - Lambda extracts `teacher_id` and `assignment_id` from S3 key path
   - For zip files: Extracts all .txt/.md files from zip
   - For each essay: Extracts student name, matches/creates student, generates new `essay_id`
   - Lambda sends SQS message per essay with `teacher_id`, `assignment_id`, `student_id`
   - Processor Lambda consumes from SQS and stores metadata

**Bug Fix (2025-11-11):**
- Legacy essays were incorrectly calling `process_single_essay()` which generated new `essay_id` and tried to re-upload
- Fixed: Legacy essays now directly send SQS message with existing `essay_id` from S3 key

### DynamoDB Updates

- Use `update_item` with `UpdateExpression` for atomic updates
- Track status transitions: `awaiting_processing` → `processing` → `processed`
- Store timestamps in ISO8601 format
- **Important**: Convert float values to Decimal before storing (DynamoDB doesn't support Python floats)
- **Important**: Use ExpressionAttributeNames for reserved keywords ("metrics", "feedback", "status", etc.)

### Error Handling

- **SQS DLQ**: Failed messages after 3 retries
- **Lambda Timeouts**: Processor Lambda set to 5 minutes
- **Bedrock Errors**: Graceful fallback, log errors
- **spaCy Errors**: Validate input text before processing

## Deployment Checklist

### Epic 1: Infrastructure ✅
1. ✅ Deploy CDK stack: `cdk deploy --require-approval never`
2. ✅ Verify all resources created (S3, DynamoDB, SQS, IAM roles)
3. ✅ Run unit tests: `npm test` (25 tests passing)
4. ✅ Verify CloudFormation outputs exported

### Epic 2: API Layer ✅
1. ✅ Create API Lambda with FastAPI + Mangum
2. ✅ Create S3 upload trigger Lambda
3. ✅ Configure API Gateway with CORS
4. ✅ Set up S3 event notifications
5. ✅ Deploy and test API endpoints (6/6 tests passing)
6. ✅ Verify S3 → SQS → Lambda flow
7. ✅ Configure Python dependency bundling in CDK

### Epic 3: Processing ✅
1. ✅ Create processor Lambda (Docker container with spaCy)
2. ✅ Test Bedrock integration (Claude 3 Sonnet)
3. ✅ Monitor CloudWatch logs
4. ✅ Fix DynamoDB compatibility issues (float/Decimal, reserved keywords)
5. ✅ End-to-end testing complete (`test_processing.py`)

### Epic 4: Frontend ✅
1. ✅ Initialize React project with Vite + TypeScript
2. ✅ Set up Tailwind CSS v4 with PostCSS
3. ✅ Initialize shadcn/ui and install components
4. ✅ Create essay upload interface
5. ✅ Implement processing status polling
6. ✅ Build metrics and feedback display
7. ✅ Configure API integration
8. ✅ Create comprehensive test suite (16/16 passing)
9. ✅ Convert to shadcn/ui components (Button, Card, Alert, Textarea)

## Common Issues

### spaCy Model Not Found
- **Issue**: `OSError: Can't find model 'en_core_web_sm'`
- **Solution**: Ensure layer is built correctly and attached to Lambda
- **Status**: ✅ Resolved - Using Docker container with model pre-installed

### Bedrock Access Denied
- **Issue**: `AccessDeniedException` when invoking model
- **Solution**: Check IAM role has `bedrock:InvokeModel` permission
- **Status**: ✅ Resolved - IAM permissions configured correctly

### SQS Message Format
- **Issue**: Processor Lambda can't parse SQS message
- **Solution**: S3 event notification wraps message in `Records` array
- **Status**: ✅ Resolved - Message parsing implemented correctly

### Lambda Timeout
- **Issue**: Processing takes > 5 minutes
- **Solution**: Increase timeout, optimize Bedrock calls (batch if possible)
- **Status**: ✅ Resolved - Processing completes in ~37 seconds for typical essay

### DynamoDB Float Type Error
- **Issue**: `TypeError: Float types are not supported. Use Decimal types instead.`
- **Solution**: Convert all float values to Decimal before storing in DynamoDB
- **Status**: ✅ Fixed - Added `convert_floats_to_decimal()` function

### DynamoDB Reserved Keyword Error
- **Issue**: `ValidationException: Attribute name is a reserved keyword; reserved keyword: metrics`
- **Solution**: Use ExpressionAttributeNames for reserved keywords in UpdateExpression
- **Status**: ✅ Fixed - Updated `update_dynamodb()` to use ExpressionAttributeNames for "metrics" and "feedback"

## Performance Considerations

- **Cold Starts**: spaCy model loading adds ~2-3s to cold start
- **Bedrock Latency**: ~1-2s per word evaluation
- **Cost**: Limit candidate words to ~20 per essay
- **Memory**: Processor Lambda needs 3008MB for spaCy
- **Processing Time**: ~37 seconds for typical essay (85 words, 20 candidate words)
  - spaCy analysis: ~1-2 seconds
  - Bedrock evaluations: ~1-2 seconds per word (20 words = ~20-40 seconds)
  - DynamoDB updates: < 1 second

## Testing Strategy

### CDK Infrastructure Tests ✅
1. ✅ **Unit Tests**: 25 tests covering all CDK resources
   - S3 bucket configuration
   - DynamoDB table schema
   - SQS queues (main + DLQ)
   - IAM roles and policies
   - CloudFormation outputs
   - Resource counts
   - Run with: `npm test`

### API Integration Tests ✅
1. ✅ **Integration Tests**: Created `test_api.py` with 6 tests
   - Health endpoint
   - POST /essay (direct upload)
   - POST /essay (presigned URL)
   - GET /essay/{essay_id}
   - Error handling (404, empty requests)
   - All tests passing

### Lambda Function Tests ✅
1. ✅ **End-to-End Integration Test (Legacy Flow)**: `test_processing.py`
   - Tests complete flow: upload → S3 → SQS → Processor → DynamoDB
   - Validates metrics calculation (word count, unique words, type-token ratio, POS distribution)
   - Validates Bedrock feedback generation (20 words evaluated)
   - Validates DynamoDB storage and retrieval
   - **Updated**: Now includes authentication (Cognito JWT token)
   - All tests passing ✅
   - Processing time: ~30-35 seconds for typical essay

2. ✅ **End-to-End Integration Test (Assignment Flow)**: `test_assignment_flow.py`
   - Tests assignment creation → presigned URL → file upload → S3 trigger → processing
   - Tests both single file and zip file uploads
   - Validates student name extraction and matching
   - Validates S3 trigger processing for assignment essays
   - All tests passing ✅

3. ✅ **Epic 7 Integration Tests**: `test_epic7.py`
   - Tests Students CRUD operations (create, list, get, update, delete)
   - Tests Assignments CRUD operations (create, list, get, presigned URL)
   - Tests authentication and authorization
   - All tests passing ✅

4. ✅ **Unit Tests**:
   - `lambda/api/tests/test_students.py` - Student database operations (all passing)
   - `lambda/api/tests/test_assignments.py` - Assignment database operations (all passing)
   - `lambda/s3_upload_trigger/tests/test_name_extraction.py` - Name extraction patterns (all passing)

5. ⏳ **Load Tests**: Verify < 60s end-to-end latency (validated in integration test)
6. ⏳ **Error Tests**: Test DLQ, timeout, and error scenarios (future enhancement)

### Frontend Tests ✅
1. ✅ **API Client Tests**: `lib/api.test.ts` (4 tests)
   - Upload essay functionality
   - Get essay functionality
   - Health check
   - Error handling (404, network errors)
   - All tests passing ✅

2. ✅ **Component Tests**: `App.test.tsx` (12 tests)
   - Initial render and form display
   - Button enable/disable logic
   - Empty text validation
   - Essay upload flow
   - Processing status display
   - Metrics display
   - Feedback display
   - Error handling
   - Form reset functionality
   - All tests passing ✅

3. ✅ **Auth Unit Tests**: `__tests__/auth.test.tsx` (13 tests)
   - Login/logout functions
   - Token storage and retrieval
   - Authentication status checks
   - Error handling
   - All tests passing ✅ (jsdom environment)

4. **Test Coverage**: 29/29 tests passing (unit tests in `frontend/`)
   - Framework: Vitest + React Testing Library
   - Mocking: API functions mocked for component tests
   - User interactions: Tested with `@testing-library/user-event`

5. ✅ **Frontend Build Fixes**:
   - Fixed Vite 7 build issue by renaming `main.tsx` to `main.jsx` and using JavaScript entry point
   - Updated Vite config to handle `.js` files with JSX syntax
   - Build now completes successfully ✅

6. 🔄 **Frontend Migration to `new_frontend/`** (2025-01-XX):
   - **Reason**: Suspected configuration issues in original `frontend/` directory
   - **New Stack**: Bun runtime + Vite 7.2 + React 19 + TypeScript
   - **Configuration Preserved**: Tailwind v4 CSS-first config (`@theme` in `index.css`)
   - **TypeScript Fixes**:
     - Added `declare const process` block for `process.env` type support
     - Fixed `verbatimModuleSyntax` errors by using `import type` for type-only imports
     - Fixed missing icon imports (`CheckCircle2` from lucide-react)
   - **Files Migrated**: All pages, components, lib files, config
   - **Build Status**: TypeScript compilation successful, all errors resolved
   - **Test Status**: Frontend tests to be set up in `new_frontend/`

7. **Browser Integration Tests** (Planned)
   - Setup: `@vitest/browser-playwright` with Chromium
   - Configuration: `vite.config.ts` with browser provider
   - Run with: `npm run test:browser`
   - Use for: Full user flows (login, protected routes, API calls with tokens)
   - Note: Browser tests require TypeScript transformation fixes (in progress)

## Epic 1 Implementation Details

### Resources Created
- **S3 Bucket**: `vocab-essays-{account}-{region}`
  - Auto-delete on stack deletion
  - S3-managed encryption
  - CORS enabled for web uploads
  - Public access blocked

- **DynamoDB Table**: `EssayMetrics`
  - Partition key: `essay_id` (String)
  - On-demand billing
  - AWS-managed encryption

- **SQS Queues**:
  - `essay-processing-queue`: Main queue, 5min visibility timeout
  - `essay-processing-dlq`: Dead-letter queue, 3 retry attempts

- **IAM Roles**:
  - `ApiLambdaRole`: For API Gateway Lambda (Epic 2)
  - `S3UploadLambdaRole`: For S3 event trigger Lambda (Epic 2)
  - `ProcessorLambdaRole`: For essay processor Lambda (Epic 3)

### Stack Outputs
All resource names and ARNs are exported as CloudFormation outputs for easy reference in subsequent epics.

## Epic 2 Implementation Details

### Lambda Functions Created
- **API Lambda** (`lambda/api/`):
  - FastAPI application with 3 endpoints
  - Mangum adapter for Lambda integration
  - CORS middleware enabled
  - Environment variables: ESSAYS_BUCKET, METRICS_TABLE, PROCESSING_QUEUE_URL

- **S3 Upload Trigger Lambda** (`lambda/s3_upload_trigger/`):
  - Processes S3 ObjectCreated events
  - Extracts essay_id from S3 key
  - Sends messages to SQS queue
  - Environment variable: PROCESSING_QUEUE_URL

### API Gateway Configuration
- **Base URL**: `https://m18eg6bei9.execute-api.us-east-1.amazonaws.com/prod/`
- **Endpoints**:
  - `POST /essay` - Create essay (direct upload or presigned URL)
  - `GET /essay/{essay_id}` - Retrieve essay results
  - `GET /health` - Health check
- **CORS**: Enabled for all origins

### Python Dependency Bundling
- CDK configured to bundle Python dependencies using Docker
- Bundling skipped during tests (`CDK_SKIP_BUNDLING=true`)
- Dependencies automatically installed during deployment

### Testing
- **CDK Tests**: 52/54 passing (2 skipped, infrastructure validation)
- **Backend Python Tests**: 49/49 passing (JWT, Students, Assignments, Essays, Metrics)
- **Name Extraction Tests**: 13/13 passing
- **Integration Tests**: 
  - `test_auth.py`: 3/3 passing
  - `test_epic7.py`: Passing (requires auth token for full tests)
  - `test_epic8.py`: All passing (Class metrics, Student metrics, Essay override)
  - `test_processing.py`: Passing
  - `test_assignment_flow.py`: Passing
  - `test_api.py`: 1/6 passing (expected - requires auth token)
- Test script: `test_api.py` for API endpoint validation

## Epic 6 Implementation Details (Authentication & Teacher Management)

### Cognito User Pool Setup
- **User Pool Name:** `vincent-vocab-teachers-pool`
- **Sign-in:** Email only (no username)
- **Password Policy:** 8+ chars, uppercase, lowercase, digits, no symbols required
- **MFA:** Disabled (for PoC)
- **Auto-verify:** Email verification enabled
- **User Pool ID:** `us-east-1_65hpvHpPX`
- **Client ID:** `jhnvud4iqcf15vac6nc2d2b9p`
- **Domain:** `vincent-vocab-971422717446.auth.us-east-1.amazoncognito.com`

### API Gateway Authorizer
- **Type:** Cognito User Pools Authorizer
- **Identity Source:** `method.request.header.Authorization`
- **Protected Routes:** All routes except `/health`
- **Public Routes:** `/health` (no auth required)

### JWT Validation
- **Library:** `python-jose[cryptography]` for JWT verification
- **JWKS:** Fetched from Cognito `.well-known/jwks.json` endpoint
- **Caching:** JWKS cached in memory after first fetch
- **Token Claims:** Extracts `sub` as `teacher_id`, `email` for display
- **Validation:** Verifies signature, issuer, expiration, audience
- **Bug Fix (2025-11-11):** Fixed JWT audience validation - now explicitly validates `aud` claim using `COGNITO_USER_POOL_CLIENT_ID`
  - Issue: JWT tokens from Cognito include `aud` claim, but `jose.jwt.decode` was skipping audience validation
  - Fix: Added `COGNITO_USER_POOL_CLIENT_ID` environment variable and explicit audience validation
  - Result: Script-created Cognito users can now authenticate successfully

### Teachers Table
- **Table Name:** `VincentVocabTeachers`
- **Partition Key:** `teacher_id` (String) - from Cognito `sub` claim
- **Attributes:** `email`, `name`, `created_at`, `updated_at`
- **Auto-creation:** Teacher records created on first `/auth/health` call

### Code Structure Changes
- **Issue:** Package conflict between `app.py` (FastAPI app) and `app/` (package directory)
- **Solution:** Renamed `app.py` → `main.py` to avoid import conflicts
- **Import Path:** `lambda_function.py` now imports `from main import app`
- **Package Structure:**
  ```
  lambda/api/
    ├── main.py (FastAPI app)
    ├── lambda_function.py (Mangum handler)
    ├── app/
    │   ├── __init__.py
    │   ├── auth.py (JWT verification)
    │   ├── deps.py (FastAPI dependencies)
    │   ├── routes/
    │   │   ├── essays.py (Essay override endpoint)
    │   │   └── metrics.py (Class and student metrics endpoints)
    │   └── db/
    │       ├── __init__.py
    │       └── teachers.py (DynamoDB operations)
  ```

### Deployment Notes
- **Deployment Time:** ~50 seconds
- **Lambda Code Update:** CDK automatically bundles and uploads on `cdk deploy`
- **Code SHA Changed:** Confirmed new code deployed (SHA: `nR0F60...`)
- **Test Results:** 3/3 authentication tests passing

## Epic 8 Implementation Details (Analytics & Teacher Review Interface)

### Backend Implementation
- **StudentMetrics Table**: Created with partition key `teacher_id`, sort key `student_id`
- **Metrics Endpoints**: 
  - `/metrics/class/{assignment_id}` - Returns ClassMetrics for assignment
  - `/metrics/student/{student_id}` - Returns StudentMetrics for student
- **Essay Override Endpoint**: `/essays/{id}/override` (PATCH) - Updates feedback and triggers aggregation
- **Aggregation Lambdas**: 
  - `class_metrics.py` - Computes assignment-level averages
  - `student_metrics.py` - Computes student-level rolling averages
- **Testing**: All unit and integration tests passing

### Frontend Implementation
- **Class Dashboard**: Displays assignment-level metrics with Recharts visualizations
- **Student Dashboard**: Shows student-level metrics over time with essay list
- **Essay Review Page**: Editable feedback view with override toggles
- **Main Dashboard**: Essay upload interface with navigation
- **Authentication**: AWS Amplify integration with protected routes

### Frontend Migration (2025-01-XX)
- **New Directory**: `new_frontend/` with Bun + Vite 7.2
- **Configuration**: Preserved Tailwind v4 CSS-first config
- **TypeScript Fixes**: 
  - Added `declare const process` for environment variable types
  - Fixed `verbatimModuleSyntax` with `import type` statements
  - Fixed missing icon imports
- **Build Status**: All TypeScript errors resolved, compilation successful

## Epic 4 Implementation Details

### Frontend Application
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite 7.2 (migrated to Bun runtime in `new_frontend/`)
- **Styling**: Tailwind CSS v4 with shadcn/ui components
- **Testing**: Vitest + React Testing Library
- **Migration**: Frontend migrated from `frontend/` to `new_frontend/` (2025-01-XX)

### shadcn/ui Setup
- **Configuration**: `components.json` with path aliases
- **Components Installed**:
  - `Button` - Primary actions with variants (default, secondary, destructive)
  - `Card` - Content containers with header, title, content sections
  - `Alert` - Status messages and error displays
  - `Textarea` - Essay text input with proper styling
- **Dependencies**: `@radix-ui/react-slot` for Button component

### Tailwind CSS v4 Configuration
- **PostCSS Plugin**: `@tailwindcss/postcss`
- **Theme System**: CSS variables defined in `@theme` block
- **Color Palette**: shadcn/ui default colors (slate base)
- **Custom Colors**: background, foreground, primary, secondary, muted, destructive, etc.

### Application Features
- **Essay Upload**: Textarea input with validation
- **Processing Status**: Real-time polling (3-second intervals) with visual indicators
- **Metrics Display**: Word count, unique words, type-token ratio, POS distribution
- **Feedback Display**: Word-level feedback with color-coded correctness
- **Error Handling**: User-friendly error messages
- **Form Reset**: "Analyze Another Essay" functionality

### API Integration
- **Client Module**: `lib/api.ts` with typed interfaces
- **Endpoints**: `uploadEssay()`, `getEssay()`, `checkHealth()`
- **Environment**: Configurable API URL via `VITE_API_URL`
- **Error Handling**: Proper error messages and status codes

### Testing
- **Test Framework**: Vitest with jsdom environment
- **Test Files**: 
  - `lib/api.test.ts` - API client tests (4 tests)
  - `App.test.tsx` - Component tests (12 tests)
- **Coverage**: 16/16 tests passing
- **Test Types**: Unit tests, integration tests, user interaction tests


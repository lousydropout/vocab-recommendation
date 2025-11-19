# API Specification

## Base URL

```
https://{api-id}.execute-api.{region}.amazonaws.com/prod
```

## Authentication

Most endpoints require authentication via Cognito JWT token. Public endpoints are available for demo purposes.

**Authorization Header:**
```
Authorization: Bearer <cognito-id-token>
```

**Public Endpoints (No Auth Required):**
- `/health` - Health check
- `/essays/public` - Public demo essay upload
- `/essays/{essay_id}` - Get essay (works for both authenticated users and public demo essays)

**Protected Endpoints (Auth Required):**
- All other endpoints require valid JWT token
- Return `401 Unauthorized` or `403 Forbidden` if missing/invalid

## Endpoints

### GET /health

Public health check endpoint (no authentication required).

**Response** (200 OK):
```json
{
  "status": "healthy"
}
```

---

### GET /auth/health

Auth health check endpoint. Validates JWT token and ensures teacher record exists.

**Headers:**
- `Authorization: Bearer <token>` (required)

**Response** (200 OK):
```json
{
  "status": "authenticated",
  "teacher_id": "uuid-from-cognito-sub",
  "email": "teacher@example.com",
  "name": "Teacher Name"
}
```

**Response** (401/403 Unauthorized):
- Missing or invalid token

---

### POST /essays/public

Public endpoint for demo essay upload (no authentication required).

**Headers:**
- `Content-Type: application/json`
- `Origin: http://localhost:3000` (or other allowed origin)

**Request Body:**
```json
{
  "essay_text": "The complete essay text here..."
}
```

**Response** (200 OK):
```json
{
  "essay_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending"
}
```

**Response** (400 Bad Request):
```json
{
  "detail": "Essay text is required"
}
```

**Notes:**
- Creates essay with `teacher_id: "demo-teacher"` and `assignment_id: "demo-public-assignment"`
- Processes through same async pipeline as authenticated uploads
- Results accessible via `GET /essays/{essay_id}` (no auth required for demo essays)

---

### POST /essays/batch

Batch upload multiple essays (authentication required).

**Headers:**
- `Authorization: Bearer <token>` (required)
- `Content-Type: application/json`

**Request Body:**
```json
{
  "assignment_id": "assignment-uuid",
  "student_id": "student-uuid",  // optional
  "essays": [
    {
      "filename": "essay1.txt",
      "text": "Essay content here..."
    },
    {
      "filename": "essay2.txt",
      "text": "Another essay..."
    }
  ]
}
```

**Response** (200 OK):
```json
[
  {
    "essay_id": "essay-uuid-1",
    "status": "pending"
  },
  {
    "essay_id": "essay-uuid-2",
    "status": "pending"
  }
]
```

---

### GET /essays/{essay_id}

Retrieve essay analysis results.

**Headers:**
- `Authorization: Bearer <token>` (optional for demo essays, required for user essays)

**Path Parameters**:
- `essay_id` (string, required): UUID of the essay

**Response** (200 OK):
```json
{
  "essay_id": "550e8400-e29b-41d4-a716-446655440000",
  "assignment_id": "assignment-uuid",
  "student_id": "student-uuid",
  "status": "processed",
  "essay_text": "Full essay text content...",
  "vocabulary_analysis": {
    "correctness_review": "Overall review of vocabulary usage...",
    "vocabulary_used": ["word1", "word2", "word3"],
    "recommended_vocabulary": ["word4", "word5"]
  },
  "created_at": "2025-11-10T17:31:00Z",
  "processed_at": "2025-11-10T17:32:30Z"
}
```

**Response** (404 Not Found):
```json
{
  "detail": "Essay not found"
}
```

**Response** (200 OK - Still Processing):
```json
{
  "essay_id": "550e8400-e29b-41d4-a716-446655440000",
  "assignment_id": "assignment-uuid",
  "student_id": "student-uuid",
  "status": "pending",
  "created_at": "2025-11-10T17:31:00Z"
}
```

**Notes:**
- Works for both authenticated users (their essays) and public demo essays
- Includes `essay_text` for reference when available
- `vocabulary_analysis` only included when status is "processed"

---

### DELETE /essays/{essay_id}

Delete an essay.

**Headers:**
- `Authorization: Bearer <token>` (required)

**Path Parameters**:
- `essay_id` (string, required): UUID of the essay

**Response** (200 OK):
```json
{
  "message": "Essay deleted successfully",
  "essay_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response** (404 Not Found):
```json
{
  "detail": "Essay not found"
}
```

**Response** (403 Forbidden):
```json
{
  "detail": "Not authorized to delete this essay"
}
```

**Notes:**
- Only the essay owner (teacher_id matches) can delete the essay
- Deletes the essay from DynamoDB permanently

---

### GET /metrics/assignment/{assignment_id}/student/{student_id}

Get student-level metrics for a specific student in a specific assignment.

**Headers:**
- `Authorization: Bearer <token>` (required)

**Path Parameters**:
- `assignment_id` (string, required): UUID of the assignment
- `student_id` (string, required): UUID of the student

**Response** (200 OK):
```json
{
  "student_id": "student-uuid",
  "stats": {
    "avg_ttr": 0.45,
    "avg_word_count": 478.0,
    "avg_unique_words": 212.0,
    "avg_freq_rank": 1750.0,
    "total_essays": 3,
    "trend": null,
    "last_essay_date": "2025-11-10T17:31:00Z"
  },
  "updated_at": "2025-11-10T17:32:30Z"
}
```

**Response** (404 Not Found):
```json
{
  "detail": "Student not found"
}
```

**Notes:**
- Computes metrics on-demand from processed essays in the Essays table
- Only includes essays with status "processed"
- Metrics are filtered by both assignment_id and student_id
- Uses same computation logic as other metrics endpoints for consistency

---

## Error Responses

All errors follow this format:

```json
{
  "detail": "Error message here"
}
```

**Status Codes**:
- `200`: Success
- `400`: Bad Request (invalid input)
- `401`: Unauthorized (missing or invalid token)
- `403`: Forbidden (token valid but insufficient permissions)
- `404`: Not Found (essay_id doesn't exist)
- `500`: Internal Server Error

## CORS

All endpoints support CORS with the following configuration:

**Allowed Origins:**
- `https://vocab.vincentchan.cloud` (production)
- `http://localhost:3000` (development)
- `http://localhost:5173` (Vite default port)

**CORS Headers:**
- `Access-Control-Allow-Origin: <origin>` (validated against allowed list)
- `Access-Control-Allow-Credentials: true`
- `Access-Control-Allow-Methods: *`
- `Access-Control-Allow-Headers: *`
- `Access-Control-Expose-Headers: *`

**Error Responses:**
- All error responses (400, 401, 403, 500, etc.) include CORS headers
- Global exception handlers ensure CORS headers are always present


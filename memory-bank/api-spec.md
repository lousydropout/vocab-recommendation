# API Specification

## Base URL

```
https://{api-id}.execute-api.{region}.amazonaws.com/prod
```

## Endpoints

### POST /essay

Create a new essay analysis request.

**Request Body** (Option 1 - Direct Upload):
```json
{
  "essay_text": "The complete essay text here..."
}
```

**Request Body** (Option 2 - Presigned URL):
```json
{
  "request_presigned_url": true
}
```

**Response** (200 OK):
```json
{
  "essay_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "awaiting_processing",
  "presigned_url": "https://s3.amazonaws.com/...",  // Only if requested
  "expires_in": 3600  // Only if presigned_url provided
}
```

**Response** (400 Bad Request):
```json
{
  "detail": "Invalid request: essay_text or request_presigned_url required"
}
```

---

### GET /essay/{essay_id}

Retrieve essay analysis results.

**Path Parameters**:
- `essay_id` (string, required): UUID of the essay

**Response** (200 OK):
```json
{
  "essay_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "processed",
  "file_key": "essays/550e8400-e29b-41d4-a716-446655440000.txt",
  "metrics": {
    "word_count": 478,
    "unique_words": 212,
    "type_token_ratio": 0.44,
    "noun_ratio": 0.29,
    "verb_ratio": 0.21,
    "avg_word_freq_rank": 1750
  },
  "feedback": [
    {
      "word": "articulated",
      "correct": false,
      "comment": "Used incorrectly; too formal"
    },
    {
      "word": "rapidly",
      "correct": true,
      "comment": ""
    }
  ],
  "created_at": "2025-11-10T17:31:00Z",
  "updated_at": "2025-11-10T17:32:30Z"
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
  "status": "processing",
  "file_key": "essays/550e8400-e29b-41d4-a716-446655440000.txt",
  "created_at": "2025-11-10T17:31:00Z",
  "updated_at": "2025-11-10T17:31:05Z"
}
```

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
- `404`: Not Found (essay_id doesn't exist)
- `500`: Internal Server Error

## CORS

All endpoints support CORS with:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`


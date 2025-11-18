# Data Models

## Current Schema (Simplified Async Architecture - 2025-01-XX)

### DynamoDB Table: `Essays` (VincentVocabEssays)

**Schema:**

| Attribute             | Type                   | Key                    | Description                                                 |
| --------------------- | ---------------------- | ---------------------- | ----------------------------------------------------------- |
| `assignment_id`       | `String`               | **Partition Key (PK)** | Assignment this essay belongs to                            |
| `essay_id`            | `String`               | **Sort Key (SK)**      | Unique UUID per essay                                       |
| `teacher_id`          | `String`               |                        | Teacher who owns this essay                                 |
| `student_id`          | `String`               |                        | Student who wrote this essay (empty string if not assigned) |
| `essay_text`          | `String`               |                        | Full essay text content (max 400KB per item)                |
| `vocabulary_analysis` | `Map`                  |                        | OpenAI GPT-4.1-mini analysis result (see structure below)   |
| `status`              | `String`               |                        | `"pending"` / `"processed"`                                 |
| `created_at`          | `String (ISO8601)`     |                        | Essay creation timestamp                                    |
| `processed_at`        | `String (ISO8601)`     |                        | Processing completion timestamp (optional)                  |
| `feedback`            | `List<Map>` (optional) |                        | Teacher override feedback (optional, for future use)        |

**Vocabulary Analysis Structure:**

```typescript
interface VocabularyAnalysis {
  correctness_review: string; // High-level review (2-3 sentences)
  vocabulary_used: string[]; // 5-10 words/phrases showing current level
  recommended_vocabulary: string[]; // 5-10 words for growth
}
```

**Example Record:**

```json
{
  "assignment_id": "assn_123",
  "essay_id": "essay_456",
  "teacher_id": "teacher_789",
  "student_id": "student_abc",
  "essay_text": "The quick brown fox jumps over the lazy dog...",
  "vocabulary_analysis": {
    "correctness_review": "The student demonstrates solid vocabulary usage with appropriate word choices...",
    "vocabulary_used": ["demonstrates", "appropriate", "solid", "usage"],
    "recommended_vocabulary": [
      "articulate",
      "sophisticated",
      "nuanced",
      "eloquent"
    ]
  },
  "status": "processed",
  "created_at": "2025-01-18T12:00:00Z",
  "processed_at": "2025-01-18T12:00:15Z"
}
```

**Status Values:**

- `"pending"`: Essay uploaded, waiting for Worker Lambda processing
- `"processed"`: Analysis complete, vocabulary_analysis available

**Note:** Maximum item size must stay under 400KB. If essays exceed this, essay_text should be offloaded to S3 (not currently implemented).

## Metadata Tables

### DynamoDB Table: `Teachers` (VincentVocabTeachers)

### DynamoDB Table: `Teachers`

| Attribute    | Type               | Key                    | Description                                |
| ------------ | ------------------ | ---------------------- | ------------------------------------------ |
| `teacher_id` | `String`           | **Partition Key (PK)** | Unique UUID per teacher (from Cognito sub) |
| `email`      | `String`           |                        | Teacher email address                      |
| `name`       | `String`           |                        | Teacher full name                          |
| `created_at` | `String (ISO8601)` |                        | Account creation timestamp                 |
| `updated_at` | `String (ISO8601)` |                        | Last update                                |

### DynamoDB Table: `Students`

| Attribute    | Type               | Key                    | Description                       |
| ------------ | ------------------ | ---------------------- | --------------------------------- |
| `teacher_id` | `String`           | **Partition Key (PK)** | Teacher who owns this student     |
| `student_id` | `String`           | **Sort Key (SK)**      | Unique UUID per student           |
| `name`       | `String`           |                        | Student full name                 |
| `created_at` | `String (ISO8601)` |                        | Student record creation timestamp |
| `updated_at` | `String (ISO8601)` |                        | Last update                       |

### DynamoDB Table: `Assignments`

| Attribute       | Type                | Key                    | Description                      |
| --------------- | ------------------- | ---------------------- | -------------------------------- |
| `teacher_id`    | `String`            | **Partition Key (PK)** | Teacher who owns this assignment |
| `assignment_id` | `String`            | **Sort Key (SK)**      | Unique UUID per assignment       |
| `title`         | `String`            |                        | Assignment title                 |
| `description`   | `String` (optional) |                        | Assignment description           |
| `created_at`    | `String (ISO8601)`  |                        | Assignment creation timestamp    |
| `updated_at`    | `String (ISO8601)`  |                        | Last update                      |

### DynamoDB Table: `Assignments` (VincentVocabAssignments)

| Attribute       | Type                | Key                    | Description                      |
| --------------- | ------------------- | ---------------------- | -------------------------------- |
| `teacher_id`    | `String`            | **Partition Key (PK)** | Teacher who owns this assignment |
| `assignment_id` | `String`            | **Sort Key (SK)**      | Unique UUID per assignment       |
| `title`         | `String`            |                        | Assignment title                 |
| `description`   | `String` (optional) |                        | Assignment description           |
| `created_at`    | `String (ISO8601)`  |                        | Assignment creation timestamp    |

**Note:** Assignments table is a simple metadata table. No computed fields, no metrics, no aggregation.

## Removed Tables (Legacy Architecture)

- ❌ **EssayMetrics**: Replaced by Essays table
- ❌ **ClassMetrics**: Metrics computed on-demand from Essays table
- ❌ **StudentMetrics**: Metrics computed on-demand from Essays table

## SQS Message Format

**EssayProcessingQueue Message:**

```json
{
  "teacher_id": "teacher_789",
  "assignment_id": "assn_123",
  "student_id": "student_abc",
  "essay_id": "essay_456"
}
```

**Important:** SQS messages contain ONLY IDs - no essay_text. Worker Lambda loads essay_text from DynamoDB to avoid 256KB SQS message size limit.

## API Request/Response Formats

### POST /essays/batch Request

```json
{
  "assignment_id": "assn_123",
  "student_id": "student_abc", // optional
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

### POST /essays/batch Response

```json
[
  {
    "essay_id": "essay_456",
    "status": "pending"
  },
  {
    "essay_id": "essay_789",
    "status": "pending"
  }
]
```

### GET /essays/{essay_id} Response

```json
{
  "essay_id": "essay_456",
  "assignment_id": "assn_123",
  "student_id": "student_abc",
  "status": "processed",
  "vocabulary_analysis": {
    "correctness_review": "...",
    "vocabulary_used": ["word1", "word2"],
    "recommended_vocabulary": ["word3", "word4"]
  },
  "created_at": "2025-01-18T12:00:00Z",
  "processed_at": "2025-01-18T12:00:15Z"
}
```

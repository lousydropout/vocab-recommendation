# Data Models

## Phase 1: PoC Tables (Epics 1-5) - COMPLETE

### DynamoDB Table: `EssayMetrics`

**Current Schema (Phase 1):**

| Attribute       | Type                | Key                    | Description                                        |
|----------------|---------------------|------------------------|----------------------------------------------------|
| `essay_id`      | `String`            | **Partition Key (PK)** | Unique UUID per essay                              |
| `status`        | `String`            |                        | `awaiting_processing` / `processing` / `processed` |
| `file_key`      | `String`            |                        | S3 object path                                     |
| `metrics`       | `Map`               |                        | Lexical stats from spaCy                           |
| `feedback`      | `List<Map>`         |                        | Bedrock word-level evaluations                     |
| `created_at`    | `String (ISO8601)`  |                        | Upload timestamp                                   |
| `updated_at`    | `String (ISO8601)`  |                        | Last update                                        |
| `student_id`    | `String` (optional) |                        | Future expansion — group essays by student         |
| `grade`         | `Number` (optional) |                        | Grade-level grouping                               |
| `assignment_id` | `String` (optional) |                        | Multi-essay expansion                              |
| `model_version` | `String` (optional) |                        | Track spaCy/Bedrock versions used                  |

**Updated Schema (Phase 2 - Epics 6-8):**

| Attribute       | Type                | Key                    | Description                                        |
|----------------|---------------------|------------------------|----------------------------------------------------|
| `teacher_id#assignment_id` | `String` | **Partition Key (PK)** | Composite key for teacher/assignment isolation |
| `student_id#essay_id` | `String` | **Sort Key (SK)** | Composite key for student/essay lookup |
| `status`        | `String`            |                        | `awaiting_processing` / `processing` / `processed` |
| `file_key`      | `String`            |                        | S3 object path                                     |
| `metrics`       | `Map`               |                        | Lexical stats from spaCy                           |
| `feedback`      | `List<Map>`         |                        | Bedrock word-level evaluations (with override flags) |
| `created_at`    | `String (ISO8601)`  |                        | Upload timestamp                                   |
| `updated_at`    | `String (ISO8601)`  |                        | Last update                                        |
| `teacher_id`    | `String`            |                        | **Required** - Teacher who owns this essay |
| `student_id`    | `String`            |                        | **Required** - Student who wrote this essay |
| `assignment_id` | `String`            |                        | **Required** - Assignment this essay belongs to |
| `model_version` | `String` (optional) |                        | Track spaCy/Bedrock versions used                  |

## Phase 2: Multi-Essay Teaching Platform Tables (Epics 6-8) - IN PROGRESS

### DynamoDB Table: `Teachers`

| Attribute       | Type                | Key                    | Description                                        |
|----------------|---------------------|------------------------|----------------------------------------------------|
| `teacher_id`    | `String`            | **Partition Key (PK)** | Unique UUID per teacher (from Cognito sub) |
| `email`         | `String`            |                        | Teacher email address                              |
| `name`          | `String`            |                        | Teacher full name                                  |
| `created_at`    | `String (ISO8601)`  |                        | Account creation timestamp                         |
| `updated_at`    | `String (ISO8601)`  |                        | Last update                                        |

### DynamoDB Table: `Students`

| Attribute       | Type                | Key                    | Description                                        |
|----------------|---------------------|------------------------|----------------------------------------------------|
| `teacher_id`    | `String`            | **Partition Key (PK)** | Teacher who owns this student |
| `student_id`    | `String`            | **Sort Key (SK)** | Unique UUID per student |
| `name`          | `String`            |                        | Student full name                                  |
| `created_at`    | `String (ISO8601)`  |                        | Student record creation timestamp                  |
| `updated_at`    | `String (ISO8601)`  |                        | Last update                                        |

### DynamoDB Table: `Assignments`

| Attribute       | Type                | Key                    | Description                                        |
|----------------|---------------------|------------------------|----------------------------------------------------|
| `teacher_id`    | `String`            | **Partition Key (PK)** | Teacher who owns this assignment |
| `assignment_id` | `String`            | **Sort Key (SK)** | Unique UUID per assignment |
| `title`         | `String`            |                        | Assignment title                                   |
| `description`   | `String` (optional) |                        | Assignment description                             |
| `created_at`    | `String (ISO8601)`  |                        | Assignment creation timestamp                      |
| `updated_at`    | `String (ISO8601)`  |                        | Last update                                        |

### DynamoDB Table: `ClassMetrics`

| Attribute       | Type                | Key                    | Description                                        |
|----------------|---------------------|------------------------|----------------------------------------------------|
| `teacher_id`    | `String`            | **Partition Key (PK)** | Teacher who owns this assignment |
| `assignment_id` | `String`            | **Sort Key (SK)** | Assignment ID |
| `avg_type_token_ratio` | `Number` |                        | Average TTR across all essays in assignment |
| `avg_word_count` | `Number` |                        | Average word count |
| `avg_unique_words` | `Number` |                        | Average unique words |
| `total_essays`  | `Number`            |                        | Total number of essays processed |
| `correctness_rate` | `Number` |                        | Percentage of words marked correct |
| `updated_at`    | `String (ISO8601)`  |                        | Last aggregation timestamp                        |

### DynamoDB Table: `StudentMetrics`

| Attribute       | Type                | Key                    | Description                                        |
|----------------|---------------------|------------------------|----------------------------------------------------|
| `teacher_id`    | `String`            | **Partition Key (PK)** | Teacher who owns this student |
| `student_id`    | `String`            | **Sort Key (SK)** | Student ID |
| `avg_type_token_ratio` | `Number` |                        | Rolling average TTR over time |
| `avg_word_count` | `Number` |                        | Rolling average word count |
| `total_essays`  | `Number`            |                        | Total essays processed for this student |
| `trend`         | `String`            |                        | `improving` / `stable` / `declining` |
| `last_essay_date` | `String (ISO8601)` |                        | Date of most recent essay |
| `updated_at`    | `String (ISO8601)`  |                        | Last aggregation timestamp                        |

### Example Record

```json
{
  "essay_id": "essay_2025_0001",
  "status": "processed",
  "file_key": "essays/essay_2025_0001.txt",
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

### Status Values

- `awaiting_processing`: Essay uploaded, waiting for processing
- `processing`: Currently being analyzed
- `processed`: Analysis complete, results available

## Metrics Structure

```typescript
interface Metrics {
  word_count: number;
  unique_words: number;
  type_token_ratio: number;  // unique_words / word_count
  noun_ratio: number;
  verb_ratio: number;
  avg_word_freq_rank: number;  // Average frequency rank (SUBTLEX/COCA)
}
```

## Feedback Structure

```typescript
interface FeedbackItem {
  word: string;
  correct: boolean;
  comment: string;
}

type Feedback = FeedbackItem[];
```

## SQS Message Format

```json
{
  "essay_id": "uuid-here",
  "file_key": "essays/uuid-here.txt"
}
```

## S3 Object Structure

- **Bucket**: `vocab-essays-{account}-{region}`
- **Key Pattern**: `essays/{essay_id}.txt`
- **Content**: Plain text essay content


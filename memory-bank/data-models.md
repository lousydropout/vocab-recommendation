# Data Models

## DynamoDB Table: `EssayMetrics`

### Schema

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


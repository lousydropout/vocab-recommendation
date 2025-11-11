import json
import os
import boto3
import logging
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Any, Optional
import spacy
import re

# Configure structured logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
# AWS_REGION is automatically set by Lambda runtime
bedrock = boto3.client('bedrock-runtime')

# Environment variables
ESSAYS_BUCKET = os.environ['ESSAYS_BUCKET']
METRICS_TABLE = os.environ['METRICS_TABLE']
BEDROCK_MODEL_ID = os.environ.get('BEDROCK_MODEL_ID', 'anthropic.claude-3-sonnet-20240229-v1:0')

# Load spaCy model (from container image)
# Model is installed in the Docker image
nlp = spacy.load('en_core_web_sm')

# Simple word frequency lookup (basic implementation)
# In production, this would use SUBTLEX/COCA data
COMMON_WORDS = {
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
    'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
    'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
    'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
    'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
    'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take',
    'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other',
    'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also',
    'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way',
    'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us'
}

def get_word_frequency_rank(word: str) -> int:
    """
    Simple frequency rank estimation.
    In production, use SUBTLEX/COCA frequency data.
    Returns lower rank for more common words.
    """
    word_lower = word.lower()
    if word_lower in COMMON_WORDS:
        return 100  # Very common
    elif len(word) <= 3:
        return 500  # Short words are often common
    elif len(word) >= 8:
        return 5000  # Longer words are often less common
    else:
        return 2000  # Medium frequency estimate


def download_essay_from_s3(bucket: str, key: str) -> str:
    """Download essay text from S3"""
    response = s3_client.get_object(Bucket=bucket, Key=key)
    return response['Body'].read().decode('utf-8')


def run_spacy_analysis(text: str) -> Dict[str, Any]:
    """Run spaCy analysis and compute lexical metrics"""
    doc = nlp(text)
    
    # Basic metrics
    words = [token.text.lower() for token in doc if token.is_alpha and not token.is_stop]
    unique_words = set(words)
    word_count = len(words)
    unique_word_count = len(unique_words)
    type_token_ratio = unique_word_count / word_count if word_count > 0 else 0.0
    
    # POS distribution
    pos_counts = {}
    for token in doc:
        if token.is_alpha and not token.is_stop:
            pos = token.pos_
            pos_counts[pos] = pos_counts.get(pos, 0) + 1
    
    total_pos_tokens = sum(pos_counts.values())
    noun_ratio = pos_counts.get('NOUN', 0) / total_pos_tokens if total_pos_tokens > 0 else 0.0
    verb_ratio = pos_counts.get('VERB', 0) / total_pos_tokens if total_pos_tokens > 0 else 0.0
    adj_ratio = pos_counts.get('ADJ', 0) / total_pos_tokens if total_pos_tokens > 0 else 0.0
    adv_ratio = pos_counts.get('ADV', 0) / total_pos_tokens if total_pos_tokens > 0 else 0.0
    
    # Average frequency rank
    freq_ranks = [get_word_frequency_rank(word) for word in words]
    avg_word_freq_rank = sum(freq_ranks) / len(freq_ranks) if freq_ranks else 0
    
    return {
        'word_count': word_count,
        'unique_words': unique_word_count,
        'type_token_ratio': round(type_token_ratio, 3),
        'noun_ratio': round(noun_ratio, 3),
        'verb_ratio': round(verb_ratio, 3),
        'adj_ratio': round(adj_ratio, 3),
        'adv_ratio': round(adv_ratio, 3),
        'avg_word_freq_rank': round(avg_word_freq_rank, 0),
        'doc': doc,  # Keep doc for candidate selection
    }


def select_candidate_words(doc, max_candidates: int = 20) -> List[Dict[str, Any]]:
    """
    Select candidate words for Bedrock evaluation.
    Prioritizes: low-frequency words, unusual POS usage, longer words.
    """
    candidates = []
    
    for token in doc:
        if not token.is_alpha or token.is_stop or len(token.text) < 4:
            continue
        
        word = token.text.lower()
        freq_rank = get_word_frequency_rank(word)
        
        # Score based on frequency and length
        score = freq_rank + (len(word) * 100)
        
        # Check for unusual POS (e.g., noun used as verb)
        # This is simplified - in production, use more sophisticated analysis
        if token.pos_ in ['NOUN', 'ADJ', 'ADV'] and len(word) >= 6:
            score += 500
        
        candidates.append({
            'word': token.text,
            'lemma': token.lemma_,
            'pos': token.pos_,
            'sentence': token.sent.text.strip(),
            'score': score,
        })
    
    # Sort by score (highest first) and take top candidates
    candidates.sort(key=lambda x: x['score'], reverse=True)
    return candidates[:max_candidates]


def evaluate_word_with_bedrock(word: str, sentence: str, essay_context: str) -> Dict[str, Any]:
    """
    Call Bedrock (Claude 3) to evaluate word usage in context.
    Returns: {word, correct, comment}
    """
    prompt = f"""You are evaluating vocabulary usage in a middle-school essay. 

Word to evaluate: "{word}"
Sentence context: "{sentence}"
Essay excerpt: "{essay_context[:500]}"

Evaluate:
1. Is this word used correctly in this sentence? (true/false)
2. Is the word's formality level appropriate for middle-school writing? (brief comment)

Respond in JSON format:
{{
  "correct": true/false,
  "comment": "brief explanation"
}}"""

    try:
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 200,
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        })
        
        response = bedrock.invoke_model(
            modelId=BEDROCK_MODEL_ID,
            body=body,
            contentType='application/json',
            accept='application/json'
        )
        
        response_body = json.loads(response['body'].read())
        
        # Extract content from Claude's response
        # Claude 3 response format: {"content": [{"type": "text", "text": "..."}]}
        content = response_body.get('content', [])
        if content and len(content) > 0:
            text = content[0].get('text', '')
            # Try to parse JSON from response
            # Claude might wrap JSON in markdown code blocks or return raw JSON
            json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', text, re.DOTALL)
            if json_match:
                try:
                    result = json.loads(json_match.group())
                    return {
                        'word': word,
                        'correct': result.get('correct', True),
                        'comment': result.get('comment', '')
                    }
                except json.JSONDecodeError:
                    pass
        
        # Fallback if JSON parsing fails - try to infer from text
        text_lower = text.lower()
        is_correct = 'incorrect' not in text_lower and 'wrong' not in text_lower
        return {
            'word': word,
            'correct': is_correct,
            'comment': text[:200] if text else 'Evaluation completed'
        }
        
    except Exception as e:
        logger.error("Error calling Bedrock", extra={
            "word": word,
            "error": str(e),
            "error_type": type(e).__name__,
        }, exc_info=True)
        return {
            'word': word,
            'correct': True,
            'comment': f'Evaluation error: {str(e)}'
        }


def convert_floats_to_decimal(obj):
    """
    Recursively convert float values to Decimal for DynamoDB compatibility.
    DynamoDB doesn't support Python float types - must use Decimal.
    """
    if isinstance(obj, dict):
        return {k: convert_floats_to_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_floats_to_decimal(item) for item in obj]
    elif isinstance(obj, float):
        return Decimal(str(obj))  # Convert float to Decimal via string to avoid precision issues
    elif isinstance(obj, int):
        # DynamoDB supports integers, but we can also use Decimal for consistency
        return obj
    else:
        return obj


def update_dynamodb(
    essay_id: str,
    status: str,
    metrics: Dict[str, Any],
    feedback: List[Dict[str, Any]],
    teacher_id: Optional[str] = None,
    assignment_id: Optional[str] = None,
    student_id: Optional[str] = None
):
    """
    Update DynamoDB record with processing results.
    
    Supports both legacy schema (essay_id as PK) and new schema (composite keys).
    For new schema: PK = teacher_id#assignment_id, SK = student_id#essay_id
    """
    table = dynamodb.Table(METRICS_TABLE)
    
    update_expression = "SET #status = :status, #updated_at = :updated_at"
    expression_attribute_names = {
        '#status': 'status',
        '#updated_at': 'updated_at'
    }
    expression_attribute_values = {
        ':status': status,
        ':updated_at': datetime.utcnow().isoformat()
    }
    
    if metrics:
        update_expression += ", #metrics = :metrics"
        expression_attribute_names['#metrics'] = 'metrics'  # 'metrics' is a reserved keyword
        # Convert floats to Decimal for DynamoDB compatibility
        expression_attribute_values[':metrics'] = convert_floats_to_decimal(metrics)
    
    if feedback:
        update_expression += ", #feedback = :feedback"
        expression_attribute_names['#feedback'] = 'feedback'  # 'feedback' might also be reserved
        # Feedback should be fine (strings, booleans), but convert just in case
        expression_attribute_values[':feedback'] = convert_floats_to_decimal(feedback)
    
    # Add assignment metadata if available
    if teacher_id:
        update_expression += ", teacher_id = :teacher_id"
        expression_attribute_values[':teacher_id'] = teacher_id
    if assignment_id:
        update_expression += ", assignment_id = :assignment_id"
        expression_attribute_values[':assignment_id'] = assignment_id
    if student_id:
        update_expression += ", student_id = :student_id"
        expression_attribute_values[':student_id'] = student_id
    
    # Determine key structure
    # Legacy: essay_id as PK
    # New: composite keys (will be handled separately if needed)
    # For now, we'll use essay_id as PK and store metadata as attributes
    # The composite key migration can be done later if needed
    
    table.update_item(
        Key={'essay_id': essay_id},
        UpdateExpression=update_expression,
        ExpressionAttributeNames=expression_attribute_names,
        ExpressionAttributeValues=expression_attribute_values
    )


def handler(event, context):
    """
    Process SQS messages containing essay processing requests.
    Each message contains: {essay_id, file_key}
    """
    logger.info("Processor Lambda invoked", extra={
        "record_count": len(event.get('Records', [])),
        "request_id": context.aws_request_id if context else None,
    })
    
    for record in event['Records']:
        essay_id = None
        try:
            # Parse SQS message
            message_body = json.loads(record['body'])
            essay_id = message_body['essay_id']
            file_key = message_body['file_key']
            teacher_id = message_body.get('teacher_id')
            assignment_id = message_body.get('assignment_id')
            student_id = message_body.get('student_id')
            
            logger.info("Processing started", extra={
                "essay_id": essay_id,
                "file_key": file_key,
                "teacher_id": teacher_id,
                "assignment_id": assignment_id,
                "student_id": student_id,
                "message_id": record.get('messageId'),
            })
            
            # Update status to 'processing'
            update_dynamodb(
                essay_id,
                'processing',
                None,
                None,
                teacher_id=teacher_id,
                assignment_id=assignment_id,
                student_id=student_id
            )
            logger.info("Status updated to processing", extra={"essay_id": essay_id})
            
            # Download essay from S3
            essay_text = download_essay_from_s3(ESSAYS_BUCKET, file_key)
            logger.info("Essay downloaded from S3", extra={
                "essay_id": essay_id,
                "text_length": len(essay_text),
            })
            
            # Run spaCy analysis
            analysis_result = run_spacy_analysis(essay_text)
            metrics = {k: v for k, v in analysis_result.items() if k != 'doc'}
            doc = analysis_result['doc']
            
            logger.info("spaCy analysis complete", extra={
                "essay_id": essay_id,
                "word_count": metrics['word_count'],
                "unique_words": metrics['unique_words'],
                "type_token_ratio": float(metrics['type_token_ratio']),
            })
            
            # Select candidate words
            candidates = select_candidate_words(doc, max_candidates=20)
            logger.info("Candidate words selected", extra={
                "essay_id": essay_id,
                "candidate_count": len(candidates),
            })
            
            # Evaluate each candidate with Bedrock
            feedback = []
            bedrock_errors = 0
            for candidate in candidates:
                word = candidate['word']
                sentence = candidate['sentence']
                
                # Get surrounding context
                context_start = max(0, essay_text.find(sentence) - 100)
                context_end = min(len(essay_text), essay_text.find(sentence) + len(sentence) + 100)
                essay_context = essay_text[context_start:context_end]
                
                evaluation = evaluate_word_with_bedrock(word, sentence, essay_context)
                feedback.append(evaluation)
                
                if 'error' in evaluation.get('comment', '').lower():
                    bedrock_errors += 1
                
                logger.debug("Word evaluated", extra={
                    "essay_id": essay_id,
                    "word": word,
                    "correct": evaluation['correct'],
                })
            
            if bedrock_errors > 0:
                logger.warning("Some Bedrock evaluations had errors", extra={
                    "essay_id": essay_id,
                    "error_count": bedrock_errors,
                    "total_words": len(candidates),
                })
            
            # Update DynamoDB with results
            update_dynamodb(
                essay_id,
                'processed',
                metrics,
                feedback,
                teacher_id=teacher_id,
                assignment_id=assignment_id,
                student_id=student_id
            )
            
            # Send message to EssayUpdateQueue for aggregation (if assignment_id is present)
            essay_update_queue_url = os.environ.get('ESSAY_UPDATE_QUEUE_URL')
            if essay_update_queue_url and assignment_id and teacher_id:
                try:
                    sqs_client = boto3.client('sqs')
                    sqs_client.send_message(
                        QueueUrl=essay_update_queue_url,
                        MessageBody=json.dumps({
                            'teacher_id': teacher_id,
                            'assignment_id': assignment_id,
                            'essay_id': essay_id,
                        })
                    )
                    logger.info("Sent message to EssayUpdateQueue", extra={
                        "teacher_id": teacher_id,
                        "assignment_id": assignment_id,
                        "essay_id": essay_id,
                    })
                except Exception as e:
                    logger.warning("Failed to send message to EssayUpdateQueue", extra={
                        "error": str(e),
                    })
            logger.info("Processing completed successfully", extra={
                "essay_id": essay_id,
                "metrics_computed": bool(metrics),
                "feedback_count": len(feedback),
            })
            
        except Exception as e:
            logger.error("Error processing message", extra={
                "essay_id": essay_id or "unknown",
                "error": str(e),
                "error_type": type(e).__name__,
            }, exc_info=True)
            # Re-raise to trigger DLQ after retries
            raise
    
    logger.info("Processor Lambda completed", extra={"processed_count": len(event['Records'])})
    
    return {
        'statusCode': 200,
        'body': json.dumps('Processing complete')
    }


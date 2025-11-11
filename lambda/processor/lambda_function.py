import json
import os
import boto3
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Any, Optional
import spacy
import re

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
        print(f"Error calling Bedrock for word '{word}': {str(e)}")
        import traceback
        traceback.print_exc()
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


def update_dynamodb(essay_id: str, status: str, metrics: Dict[str, Any], feedback: List[Dict[str, Any]]):
    """Update DynamoDB record with processing results"""
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
    print(f"Received event: {json.dumps(event)}")
    
    for record in event['Records']:
        try:
            # Parse SQS message
            message_body = json.loads(record['body'])
            essay_id = message_body['essay_id']
            file_key = message_body['file_key']
            
            print(f"Processing essay_id: {essay_id}, file_key: {file_key}")
            
            # Update status to 'processing'
            update_dynamodb(essay_id, 'processing', None, None)
            
            # Download essay from S3
            essay_text = download_essay_from_s3(ESSAYS_BUCKET, file_key)
            print(f"Downloaded essay, length: {len(essay_text)} characters")
            
            # Run spaCy analysis
            analysis_result = run_spacy_analysis(essay_text)
            metrics = {k: v for k, v in analysis_result.items() if k != 'doc'}
            doc = analysis_result['doc']
            
            print(f"spaCy analysis complete. Word count: {metrics['word_count']}")
            
            # Select candidate words
            candidates = select_candidate_words(doc, max_candidates=20)
            print(f"Selected {len(candidates)} candidate words for evaluation")
            
            # Evaluate each candidate with Bedrock
            feedback = []
            for candidate in candidates:
                word = candidate['word']
                sentence = candidate['sentence']
                
                # Get surrounding context
                context_start = max(0, essay_text.find(sentence) - 100)
                context_end = min(len(essay_text), essay_text.find(sentence) + len(sentence) + 100)
                essay_context = essay_text[context_start:context_end]
                
                evaluation = evaluate_word_with_bedrock(word, sentence, essay_context)
                feedback.append(evaluation)
                print(f"Evaluated word: {word}, correct: {evaluation['correct']}")
            
            # Update DynamoDB with results
            update_dynamodb(essay_id, 'processed', metrics, feedback)
            print(f"Successfully processed essay_id: {essay_id}")
            
        except Exception as e:
            print(f"Error processing message: {str(e)}")
            import traceback
            traceback.print_exc()
            # Re-raise to trigger DLQ after retries
            raise
    
    return {
        'statusCode': 200,
        'body': json.dumps('Processing complete')
    }


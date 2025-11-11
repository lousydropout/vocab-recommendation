"""
Aggregation Lambda for computing ClassMetrics.
Processes EssayUpdateQueue messages and computes assignment-level aggregates.
"""
import os
import json
import boto3
from boto3.dynamodb.conditions import Attr
import logging
from datetime import datetime
from typing import Dict, List, Any
from decimal import Decimal
from collections import defaultdict

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')

# Environment variables
METRICS_TABLE = os.environ.get('METRICS_TABLE')
CLASS_METRICS_TABLE = os.environ.get('CLASS_METRICS_TABLE')

metrics_table = dynamodb.Table(METRICS_TABLE) if METRICS_TABLE else None
class_metrics_table = dynamodb.Table(CLASS_METRICS_TABLE) if CLASS_METRICS_TABLE else None


def convert_floats_to_decimal(obj):
    """Recursively convert float values to Decimal for DynamoDB compatibility."""
    if isinstance(obj, dict):
        return {k: convert_floats_to_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_floats_to_decimal(item) for item in obj]
    elif isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, int):
        return obj
    else:
        return obj


def query_essays_for_assignment(teacher_id: str, assignment_id: str) -> List[Dict]:
    """
    Query all processed essays for a given assignment.
    Uses a scan with filter (since we're using essay_id as PK, not composite keys).
    In production, consider using GSI or migrating to composite keys.
    """
    if not metrics_table:
        logger.error("METRICS_TABLE environment variable not set")
        return []
    
    try:
        # Scan with filter (not ideal for large datasets, but works for PoC)
        # In production, use GSI on teacher_id#assignment_id
        response = metrics_table.scan(
            FilterExpression=Attr('teacher_id').eq(teacher_id) &
                            Attr('assignment_id').eq(assignment_id) &
                            Attr('status').eq('processed')
        )
        
        essays = response.get('Items', [])
        
        # Handle pagination
        while 'LastEvaluatedKey' in response:
            response = metrics_table.scan(
                FilterExpression=Attr('teacher_id').eq(teacher_id) &
                                Attr('assignment_id').eq(assignment_id) &
                                Attr('status').eq('processed'),
                ExclusiveStartKey=response['LastEvaluatedKey']
            )
            essays.extend(response.get('Items', []))
        
        logger.info("Queried essays for assignment", extra={
            "teacher_id": teacher_id,
            "assignment_id": assignment_id,
            "essay_count": len(essays),
        })
        
        return essays
        
    except Exception as e:
        logger.error("Failed to query essays for assignment", extra={
            "teacher_id": teacher_id,
            "assignment_id": assignment_id,
            "error": str(e),
        }, exc_info=True)
        return []


def compute_class_metrics(essays: List[Dict]) -> Dict[str, Any]:
    """
    Compute aggregate metrics from a list of essays.
    
    Returns:
        Dictionary with aggregate statistics
    """
    if not essays:
        return {
            'avg_ttr': 0.0,
            'avg_freq_rank': 0.0,
            'correctness': {'correct': 0.0, 'incorrect': 0.0},
            'essay_count': 0,
        }
    
    # Aggregate metrics
    ttr_values = []
    freq_rank_values = []
    correctness_counts = {'correct': 0, 'incorrect': 0}
    total_feedback_items = 0
    
    for essay in essays:
        metrics = essay.get('metrics', {})
        feedback = essay.get('feedback', [])
        
        # Type-token ratio
        if 'type_token_ratio' in metrics:
            ttr = float(metrics['type_token_ratio']) if isinstance(metrics['type_token_ratio'], Decimal) else metrics['type_token_ratio']
            ttr_values.append(ttr)
        
        # Average frequency rank
        if 'avg_word_freq_rank' in metrics:
            freq_rank = float(metrics['avg_word_freq_rank']) if isinstance(metrics['avg_word_freq_rank'], Decimal) else metrics['avg_word_freq_rank']
            freq_rank_values.append(freq_rank)
        
        # Correctness distribution
        for feedback_item in feedback:
            if isinstance(feedback_item, dict):
                is_correct = feedback_item.get('correct', True)
                if is_correct:
                    correctness_counts['correct'] += 1
                else:
                    correctness_counts['incorrect'] += 1
                total_feedback_items += 1
    
    # Compute averages
    avg_ttr = sum(ttr_values) / len(ttr_values) if ttr_values else 0.0
    avg_freq_rank = sum(freq_rank_values) / len(freq_rank_values) if freq_rank_values else 0.0
    
    # Correctness distribution (as ratios)
    if total_feedback_items > 0:
        correctness_ratio = {
            'correct': correctness_counts['correct'] / total_feedback_items,
            'incorrect': correctness_counts['incorrect'] / total_feedback_items,
        }
    else:
        correctness_ratio = {'correct': 0.0, 'incorrect': 0.0}
    
    return {
        'avg_ttr': round(avg_ttr, 3),
        'avg_freq_rank': round(avg_freq_rank, 1),
        'correctness': correctness_ratio,
        'essay_count': len(essays),
    }


def update_class_metrics(teacher_id: str, assignment_id: str, stats: Dict[str, Any]):
    """
    Update or create ClassMetrics record.
    """
    if not class_metrics_table:
        logger.error("CLASS_METRICS_TABLE environment variable not set")
        return
    
    now = datetime.utcnow().isoformat()
    
    # Convert floats to Decimal
    stats_decimal = convert_floats_to_decimal(stats)
    
    try:
        class_metrics_table.put_item(
            Item={
                'teacher_id': teacher_id,
                'assignment_id': assignment_id,
                'stats': stats_decimal,
                'updated_at': now,
            }
        )
        logger.info("ClassMetrics updated", extra={
            "teacher_id": teacher_id,
            "assignment_id": assignment_id,
            "essay_count": stats.get('essay_count', 0),
        })
    except Exception as e:
        logger.error("Failed to update ClassMetrics", extra={
            "teacher_id": teacher_id,
            "assignment_id": assignment_id,
            "error": str(e),
        }, exc_info=True)
        raise


def process_assignment_update(teacher_id: str, assignment_id: str):
    """
    Process a single assignment update:
    1. Query all essays for the assignment
    2. Compute aggregate metrics
    3. Update ClassMetrics table
    """
    logger.info("Processing assignment update", extra={
        "teacher_id": teacher_id,
        "assignment_id": assignment_id,
    })
    
    # Query essays
    essays = query_essays_for_assignment(teacher_id, assignment_id)
    
    # Compute metrics
    stats = compute_class_metrics(essays)
    
    # Update ClassMetrics
    update_class_metrics(teacher_id, assignment_id, stats)
    
    logger.info("Assignment update processed", extra={
        "teacher_id": teacher_id,
        "assignment_id": assignment_id,
        "essay_count": stats.get('essay_count', 0),
    })


def handler(event, context):
    """
    Process SQS messages from EssayUpdateQueue.
    Each message contains: {teacher_id, assignment_id, essay_id}
    """
    logger.info("Aggregation Lambda invoked", extra={
        "record_count": len(event.get('Records', [])),
        "request_id": context.aws_request_id if context else None,
    })
    
    # Group messages by assignment to avoid duplicate processing
    assignments_to_process = set()
    
    for record in event.get('Records', []):
        try:
            message_body = json.loads(record['body'])
            teacher_id = message_body.get('teacher_id')
            assignment_id = message_body.get('assignment_id')
            
            if teacher_id and assignment_id:
                assignments_to_process.add((teacher_id, assignment_id))
            else:
                logger.warning("Message missing teacher_id or assignment_id", extra={
                    "message_body": message_body,
                })
                
        except Exception as e:
            logger.error("Failed to parse message", extra={
                "error": str(e),
            }, exc_info=True)
            continue
    
    # Process each unique assignment
    for teacher_id, assignment_id in assignments_to_process:
        try:
            process_assignment_update(teacher_id, assignment_id)
        except Exception as e:
            logger.error("Failed to process assignment update", extra={
                "teacher_id": teacher_id,
                "assignment_id": assignment_id,
                "error": str(e),
            }, exc_info=True)
            # Don't raise - continue processing other assignments
    
    logger.info("Aggregation Lambda completed", extra={
        "assignments_processed": len(assignments_to_process),
    })
    
    return {
        'statusCode': 200,
        'body': json.dumps({
            'message': 'Aggregation complete',
            'assignments_processed': len(assignments_to_process),
        })
    }


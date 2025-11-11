"""
Aggregation Lambda for computing StudentMetrics.
Processes EssayUpdateQueue messages and computes student-level rolling averages.
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
STUDENT_METRICS_TABLE = os.environ.get('STUDENT_METRICS_TABLE')

metrics_table = dynamodb.Table(METRICS_TABLE) if METRICS_TABLE else None
student_metrics_table = dynamodb.Table(STUDENT_METRICS_TABLE) if STUDENT_METRICS_TABLE else None


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


def query_essays_for_student(teacher_id: str, student_id: str) -> List[Dict]:
    """
    Query all processed essays for a given student.
    Uses a scan with filter (since we're using essay_id as PK, not composite keys).
    In production, consider using GSI or migrating to composite keys.
    """
    if not metrics_table:
        logger.error("METRICS_TABLE environment variable not set")
        return []
    
    try:
        # Scan with filter (not ideal for large datasets, but works for PoC)
        # In production, use GSI on teacher_id#student_id
        response = metrics_table.scan(
            FilterExpression=Attr('teacher_id').eq(teacher_id) &
                            Attr('student_id').eq(student_id) &
                            Attr('status').eq('processed')
        )
        
        essays = response.get('Items', [])
        
        # Handle pagination
        while 'LastEvaluatedKey' in response:
            response = metrics_table.scan(
                FilterExpression=Attr('teacher_id').eq(teacher_id) &
                                Attr('student_id').eq(student_id) &
                                Attr('status').eq('processed'),
                ExclusiveStartKey=response['LastEvaluatedKey']
            )
            essays.extend(response.get('Items', []))
        
        logger.info("Queried essays for student", extra={
            "teacher_id": teacher_id,
            "student_id": student_id,
            "essay_count": len(essays),
        })
        
        return essays
        
    except Exception as e:
        logger.error("Failed to query essays for student", extra={
            "teacher_id": teacher_id,
            "student_id": student_id,
            "error": str(e),
        }, exc_info=True)
        return []


def compute_student_metrics(essays: List[Dict]) -> Dict[str, Any]:
    """
    Compute rolling average metrics from a list of essays for a student.
    
    Returns:
        Dictionary with aggregate statistics and trend
    """
    if not essays:
        return {
            'avg_ttr': 0.0,
            'avg_word_count': 0.0,
            'avg_unique_words': 0.0,
            'avg_freq_rank': 0.0,
            'total_essays': 0,
            'trend': 'stable',
            'last_essay_date': None,
        }
    
    # Aggregate metrics
    ttr_values = []
    word_count_values = []
    unique_words_values = []
    freq_rank_values = []
    essay_dates = []
    
    for essay in essays:
        metrics = essay.get('metrics', {})
        created_at = essay.get('created_at')
        
        # Type-token ratio
        if 'type_token_ratio' in metrics:
            ttr = float(metrics['type_token_ratio']) if isinstance(metrics['type_token_ratio'], Decimal) else metrics['type_token_ratio']
            ttr_values.append(ttr)
        
        # Word count
        if 'word_count' in metrics:
            word_count = int(metrics['word_count'])
            word_count_values.append(word_count)
        
        # Unique words
        if 'unique_words' in metrics:
            unique_words = int(metrics['unique_words'])
            unique_words_values.append(unique_words)
        
        # Average frequency rank
        if 'avg_word_freq_rank' in metrics:
            freq_rank = float(metrics['avg_word_freq_rank']) if isinstance(metrics['avg_word_freq_rank'], Decimal) else metrics['avg_word_freq_rank']
            freq_rank_values.append(freq_rank)
        
        # Essay dates for trend calculation
        if created_at:
            essay_dates.append(created_at)
    
    # Compute averages
    avg_ttr = sum(ttr_values) / len(ttr_values) if ttr_values else 0.0
    avg_word_count = sum(word_count_values) / len(word_count_values) if word_count_values else 0.0
    avg_unique_words = sum(unique_words_values) / len(unique_words_values) if unique_words_values else 0.0
    avg_freq_rank = sum(freq_rank_values) / len(freq_rank_values) if freq_rank_values else 0.0
    
    # Determine trend (simple: compare last 3 essays to previous 3)
    trend = 'stable'
    if len(ttr_values) >= 6:
        recent_ttr = sum(ttr_values[-3:]) / 3
        previous_ttr = sum(ttr_values[-6:-3]) / 3
        if recent_ttr > previous_ttr * 1.05:  # 5% improvement threshold
            trend = 'improving'
        elif recent_ttr < previous_ttr * 0.95:  # 5% decline threshold
            trend = 'declining'
    
    # Get most recent essay date
    last_essay_date = max(essay_dates) if essay_dates else None
    
    return {
        'avg_ttr': round(avg_ttr, 3),
        'avg_word_count': round(avg_word_count, 1),
        'avg_unique_words': round(avg_unique_words, 1),
        'avg_freq_rank': round(avg_freq_rank, 1),
        'total_essays': len(essays),
        'trend': trend,
        'last_essay_date': last_essay_date,
    }


def update_student_metrics(teacher_id: str, student_id: str, stats: Dict[str, Any]):
    """
    Update or create StudentMetrics record.
    """
    if not student_metrics_table:
        logger.error("STUDENT_METRICS_TABLE environment variable not set")
        return
    
    now = datetime.utcnow().isoformat()
    
    # Convert floats to Decimal
    stats_decimal = convert_floats_to_decimal(stats)
    
    try:
        student_metrics_table.put_item(
            Item={
                'teacher_id': teacher_id,
                'student_id': student_id,
                'stats': stats_decimal,
                'updated_at': now,
            }
        )
        logger.info("StudentMetrics updated", extra={
            "teacher_id": teacher_id,
            "student_id": student_id,
            "total_essays": stats.get('total_essays', 0),
        })
    except Exception as e:
        logger.error("Failed to update StudentMetrics", extra={
            "teacher_id": teacher_id,
            "student_id": student_id,
            "error": str(e),
        }, exc_info=True)
        raise


def process_student_update(teacher_id: str, student_id: str):
    """
    Process a single student update:
    1. Query all essays for the student
    2. Compute rolling average metrics
    3. Update StudentMetrics table
    """
    logger.info("Processing student update", extra={
        "teacher_id": teacher_id,
        "student_id": student_id,
    })
    
    # Query essays
    essays = query_essays_for_student(teacher_id, student_id)
    
    # Compute metrics
    stats = compute_student_metrics(essays)
    
    # Update StudentMetrics
    update_student_metrics(teacher_id, student_id, stats)
    
    logger.info("Student update processed", extra={
        "teacher_id": teacher_id,
        "student_id": student_id,
        "total_essays": stats.get('total_essays', 0),
    })


def handler(event, context):
    """
    Process SQS messages from EssayUpdateQueue.
    Each message contains: {teacher_id, assignment_id, essay_id, student_id}
    We process student-level aggregations.
    """
    logger.info("Student Metrics Aggregation Lambda invoked", extra={
        "record_count": len(event.get('Records', [])),
        "request_id": context.aws_request_id if context else None,
    })
    
    # Group messages by student to avoid duplicate processing
    students_to_process = set()
    
    for record in event.get('Records', []):
        try:
            message_body = json.loads(record['body'])
            teacher_id = message_body.get('teacher_id')
            student_id = message_body.get('student_id')
            
            if teacher_id and student_id:
                students_to_process.add((teacher_id, student_id))
            else:
                logger.warning("Message missing teacher_id or student_id", extra={
                    "message_body": message_body,
                })
                
        except Exception as e:
            logger.error("Failed to parse message", extra={
                "error": str(e),
            }, exc_info=True)
            continue
    
    # Process each unique student
    for teacher_id, student_id in students_to_process:
        try:
            process_student_update(teacher_id, student_id)
        except Exception as e:
            logger.error("Failed to process student update", extra={
                "teacher_id": teacher_id,
                "student_id": student_id,
                "error": str(e),
            }, exc_info=True)
            # Don't raise - continue processing other students
    
    logger.info("Student Metrics Aggregation Lambda completed", extra={
        "students_processed": len(students_to_process),
    })
    
    return {
        'statusCode': 200,
        'body': json.dumps({
            'message': 'Student metrics aggregation complete',
            'students_processed': len(students_to_process),
        })
    }



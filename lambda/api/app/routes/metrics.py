"""
Metrics API routes for Epic 8.
Provides endpoints for class-level and student-level metrics.

Note: Legacy metrics tables (ClassMetrics, StudentMetrics) have been removed.
Metrics are computed on-demand from the Essays table.
"""
import os
import boto3
import logging
import re
from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any, Optional, List
from pydantic import BaseModel
from boto3.dynamodb.conditions import Key, Attr
from datetime import datetime

from app.deps import get_teacher_context, TeacherContext

logger = logging.getLogger(__name__)


def compute_essay_metrics(essay_text: str, vocabulary_analysis: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Compute metrics from essay text.
    
    Args:
        essay_text: The essay text content
        vocabulary_analysis: Optional vocabulary analysis dict
        
    Returns:
        Dict with computed metrics: word_count, unique_words, type_token_ratio, avg_freq_rank, correctness
    """
    if not essay_text:
        return {
            'word_count': 0,
            'unique_words': 0,
            'type_token_ratio': 0.0,
            'avg_freq_rank': 0.0,
            'correctness': {'correct': 0.0, 'incorrect': 0.0},
        }
    
    # Tokenize words (simple approach: split on whitespace and punctuation)
    words = re.findall(r'\b[a-zA-Z]+\b', essay_text.lower())
    word_count = len(words)
    unique_words = len(set(words))
    type_token_ratio = unique_words / word_count if word_count > 0 else 0.0
    
    # Estimate correctness from vocabulary_analysis if available
    correctness_correct = 0.0
    correctness_incorrect = 0.0
    
    if vocabulary_analysis:
        correctness_review = vocabulary_analysis.get('correctness_review', '').lower()
        # Simple heuristic: if review mentions errors/incorrect/mistakes, estimate some incorrect usage
        # Otherwise assume mostly correct
        error_indicators = ['error', 'incorrect', 'mistake', 'misuse', 'wrong', 'inappropriate']
        has_errors = any(indicator in correctness_review for indicator in error_indicators)
        
        if has_errors:
            # Estimate: if errors mentioned, assume ~10-20% incorrect
            correctness_incorrect = word_count * 0.15
            correctness_correct = word_count * 0.85
        else:
            # No errors mentioned, assume mostly correct (95%+)
            correctness_correct = word_count * 0.95
            correctness_incorrect = word_count * 0.05
    
    # Estimate frequency rank from vocabulary_used (if available)
    # Higher frequency rank = more advanced/less common words
    avg_freq_rank = 0.0
    if vocabulary_analysis and vocabulary_analysis.get('vocabulary_used'):
        vocab_words = vocabulary_analysis.get('vocabulary_used', [])
        # Simple heuristic: longer words and less common words have higher frequency rank
        # Estimate based on average word length (rough proxy)
        if vocab_words:
            avg_length = sum(len(word) for word in vocab_words) / len(vocab_words)
            # Map average length to frequency rank (rough estimate: 5 chars = rank 1000, 8 chars = rank 5000)
            avg_freq_rank = max(500, min(10000, (avg_length - 4) * 1500))
    
    return {
        'word_count': word_count,
        'unique_words': unique_words,
        'type_token_ratio': type_token_ratio,
        'avg_freq_rank': avg_freq_rank,
        'correctness': {
            'correct': correctness_correct,
            'incorrect': correctness_incorrect,
        },
    }

router = APIRouter(prefix="/metrics", tags=["metrics"])

# Initialize DynamoDB
dynamodb = boto3.resource('dynamodb')
ESSAYS_TABLE = os.environ.get('ESSAYS_TABLE')

essays_table = dynamodb.Table(ESSAYS_TABLE) if ESSAYS_TABLE else None
# Legacy CLASS_METRICS_TABLE and STUDENT_METRICS_TABLE removed - compute on-demand from Essays table


class ClassMetricsResponse(BaseModel):
    """Response model for class metrics."""
    assignment_id: str
    stats: Dict[str, Any]
    updated_at: str


class StudentMetricsResponse(BaseModel):
    """Response model for student metrics."""
    student_id: str
    stats: Dict[str, Any]
    updated_at: str


@router.get("/class/{assignment_id}", response_model=ClassMetricsResponse)
async def get_class_metrics(
    assignment_id: str,
    teacher_ctx: TeacherContext = Depends(get_teacher_context)
):
    """
    Get class-level metrics for a specific assignment.
    
    Computes metrics on-demand from the Essays table by querying all essays
    for the given assignment_id.
    """
    if not essays_table:
        raise HTTPException(status_code=500, detail="Essays table not configured")
    
    try:
        # Query essays by assignment_id (partition key)
        # Filter by teacher_id and status='processed'
        response = essays_table.query(
            KeyConditionExpression=Key('assignment_id').eq(assignment_id),
            FilterExpression=Attr('teacher_id').eq(teacher_ctx.teacher_id) &
                            Attr('status').eq('processed')
        )
        
        essays = response.get('Items', [])
        
        # Handle pagination
        while 'LastEvaluatedKey' in response:
            response = essays_table.query(
                KeyConditionExpression=Key('assignment_id').eq(assignment_id),
                FilterExpression=Attr('teacher_id').eq(teacher_ctx.teacher_id) &
                                Attr('status').eq('processed'),
                ExclusiveStartKey=response['LastEvaluatedKey']
            )
            essays.extend(response.get('Items', []))
        
        essay_count = len(essays)
        
        # Compute metrics from essay texts
        total_ttr = 0.0
        total_freq_rank = 0.0
        total_correct = 0.0
        total_incorrect = 0.0
        essays_with_metrics = 0
        
        for essay in essays:
            essay_text = essay.get('essay_text', '')
            vocabulary_analysis = essay.get('vocabulary_analysis')
            
            if essay_text:
                metrics = compute_essay_metrics(essay_text, vocabulary_analysis)
                total_ttr += metrics['type_token_ratio']
                total_freq_rank += metrics['avg_freq_rank']
                total_correct += metrics['correctness']['correct']
                total_incorrect += metrics['correctness']['incorrect']
                essays_with_metrics += 1
        
        # Compute averages
        avg_ttr = total_ttr / essays_with_metrics if essays_with_metrics > 0 else 0.0
        avg_freq_rank = total_freq_rank / essays_with_metrics if essays_with_metrics > 0 else 0.0
        
        stats = {
            'avg_ttr': avg_ttr,
            'avg_freq_rank': avg_freq_rank,
            'correctness': {
                'correct': total_correct,
                'incorrect': total_incorrect,
            },
            'essay_count': essay_count,
        }
        
        # Get most recent updated_at timestamp
        updated_at = ''
        if essays:
            processed_times = [e.get('processed_at', '') for e in essays if e.get('processed_at')]
            if processed_times:
                updated_at = max(processed_times)
        
        logger.info("Class metrics computed", extra={
            "teacher_id": teacher_ctx.teacher_id,
            "assignment_id": assignment_id,
            "essay_count": essay_count,
        })
        
        return ClassMetricsResponse(
            assignment_id=assignment_id,
            stats=stats,
            updated_at=updated_at,
        )
        
    except Exception as e:
        logger.error("Failed to get class metrics", extra={
            "teacher_id": teacher_ctx.teacher_id,
            "assignment_id": assignment_id,
            "error": str(e),
        }, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve class metrics: {str(e)}")


@router.get("/student/{student_id}", response_model=StudentMetricsResponse)
async def get_student_metrics(
    student_id: str,
    teacher_ctx: TeacherContext = Depends(get_teacher_context)
):
    """
    Get student-level metrics for a specific student.
    
    Computes metrics on-demand from the Essays table by scanning for all essays
    with the given student_id.
    """
    if not essays_table:
        raise HTTPException(status_code=500, detail="Essays table not configured")
    
    try:
        # Scan for essays by student_id (not a partition key, so we need to scan)
        # Filter by teacher_id and status='processed'
        response = essays_table.scan(
            FilterExpression=Attr('teacher_id').eq(teacher_ctx.teacher_id) &
                            Attr('student_id').eq(student_id) &
                            Attr('status').eq('processed')
        )
        
        essays = response.get('Items', [])
        
        # Handle pagination
        while 'LastEvaluatedKey' in response:
            response = essays_table.scan(
                FilterExpression=Attr('teacher_id').eq(teacher_ctx.teacher_id) &
                                Attr('student_id').eq(student_id) &
                                Attr('status').eq('processed'),
                ExclusiveStartKey=response['LastEvaluatedKey']
            )
            essays.extend(response.get('Items', []))
        
        total_essays = len(essays)
        
        # Sort essays by created_at to find most recent
        essays.sort(key=lambda x: x.get('created_at', ''))
        
        # Compute metrics from essay texts
        total_ttr = 0.0
        total_word_count = 0.0
        total_unique_words = 0.0
        total_freq_rank = 0.0
        essays_with_metrics = 0
        
        for essay in essays:
            essay_text = essay.get('essay_text', '')
            vocabulary_analysis = essay.get('vocabulary_analysis')
            
            if essay_text:
                metrics = compute_essay_metrics(essay_text, vocabulary_analysis)
                total_ttr += metrics['type_token_ratio']
                total_word_count += metrics['word_count']
                total_unique_words += metrics['unique_words']
                total_freq_rank += metrics['avg_freq_rank']
                essays_with_metrics += 1
        
        # Compute averages
        avg_ttr = total_ttr / essays_with_metrics if essays_with_metrics > 0 else 0.0
        avg_word_count = total_word_count / essays_with_metrics if essays_with_metrics > 0 else 0.0
        avg_unique_words = total_unique_words / essays_with_metrics if essays_with_metrics > 0 else 0.0
        avg_freq_rank = total_freq_rank / essays_with_metrics if essays_with_metrics > 0 else 0.0
        
        stats = {
            'avg_ttr': avg_ttr,
            'avg_word_count': avg_word_count,
            'avg_unique_words': avg_unique_words,
            'avg_freq_rank': avg_freq_rank,
            'total_essays': total_essays,
            'trend': None,  # Would need 2+ essays with comparable metrics to compute
            'last_essay_date': essays[-1].get('created_at') if essays else None,
        }
        
        # Get most recent updated_at timestamp
        updated_at = ''
        if essays:
            processed_times = [e.get('processed_at', '') for e in essays if e.get('processed_at')]
            if processed_times:
                updated_at = max(processed_times)
        
        logger.info("Student metrics computed", extra={
            "teacher_id": teacher_ctx.teacher_id,
            "student_id": student_id,
            "total_essays": total_essays,
        })
        
        return StudentMetricsResponse(
            student_id=student_id,
            stats=stats,
            updated_at=updated_at,
        )
        
    except Exception as e:
        logger.error("Failed to get student metrics", extra={
            "teacher_id": teacher_ctx.teacher_id,
            "student_id": student_id,
            "error": str(e),
        }, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve student metrics: {str(e)}")


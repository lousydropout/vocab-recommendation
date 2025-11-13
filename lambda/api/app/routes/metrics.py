"""
Metrics API routes for Epic 8.
Provides endpoints for class-level and student-level metrics.
"""
import os
import boto3
import logging
from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any, Optional
from pydantic import BaseModel

from app.deps import get_teacher_context, TeacherContext

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/metrics", tags=["metrics"])

# Initialize DynamoDB
dynamodb = boto3.resource('dynamodb')
CLASS_METRICS_TABLE = os.environ.get('CLASS_METRICS_TABLE')
STUDENT_METRICS_TABLE = os.environ.get('STUDENT_METRICS_TABLE')

class_metrics_table = dynamodb.Table(CLASS_METRICS_TABLE) if CLASS_METRICS_TABLE else None
student_metrics_table = dynamodb.Table(STUDENT_METRICS_TABLE) if STUDENT_METRICS_TABLE else None


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
    
    Returns pre-computed metrics from ClassMetrics table including:
    - Average type-token ratio
    - Average frequency rank
    - Correctness distribution
    - Essay count
    """
    if not class_metrics_table:
        raise HTTPException(status_code=500, detail="ClassMetrics table not configured")
    
    try:
        response = class_metrics_table.get_item(
            Key={
                'teacher_id': teacher_ctx.teacher_id,
                'assignment_id': assignment_id,
            }
        )
        
        if 'Item' not in response:
            # Return empty metrics if not found
            return ClassMetricsResponse(
                assignment_id=assignment_id,
                stats={
                    'avg_ttr': 0.0,
                    'avg_freq_rank': 0.0,
                    'correctness': {'correct': 0.0, 'incorrect': 0.0},
                    'essay_count': 0,
                },
                updated_at='',
            )
        
        item = response['Item']
        
        logger.info("Class metrics retrieved", extra={
            "teacher_id": teacher_ctx.teacher_id,
            "assignment_id": assignment_id,
        })
        
        return ClassMetricsResponse(
            assignment_id=item['assignment_id'],
            stats=item.get('stats', {}),
            updated_at=item.get('updated_at', ''),
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
    
    Returns pre-computed rolling averages from StudentMetrics table including:
    - Average type-token ratio
    - Average word count
    - Average unique words
    - Average frequency rank
    - Total essays
    - Trend (improving/stable/declining/null - null when < 2 essays)
    - Last essay date
    """
    if not student_metrics_table:
        raise HTTPException(status_code=500, detail="StudentMetrics table not configured")
    
    try:
        response = student_metrics_table.get_item(
            Key={
                'teacher_id': teacher_ctx.teacher_id,
                'student_id': student_id,
            }
        )
        
        if 'Item' not in response:
            # Return empty metrics if not found
            return StudentMetricsResponse(
                student_id=student_id,
                stats={
                    'avg_ttr': 0.0,
                    'avg_word_count': 0.0,
                    'avg_unique_words': 0.0,
                    'avg_freq_rank': 0.0,
                    'total_essays': 0,
                    'trend': None,
                    'last_essay_date': None,
                },
                updated_at='',
            )
        
        item = response['Item']
        
        logger.info("Student metrics retrieved", extra={
            "teacher_id": teacher_ctx.teacher_id,
            "student_id": student_id,
        })
        
        return StudentMetricsResponse(
            student_id=item['student_id'],
            stats=item.get('stats', {}),
            updated_at=item.get('updated_at', ''),
        )
        
    except Exception as e:
        logger.error("Failed to get student metrics", extra={
            "teacher_id": teacher_ctx.teacher_id,
            "student_id": student_id,
            "error": str(e),
        }, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve student metrics: {str(e)}")


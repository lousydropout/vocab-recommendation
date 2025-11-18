"""
Metrics API routes for Epic 8.
Provides endpoints for class-level and student-level metrics.

Note: Legacy metrics tables (ClassMetrics, StudentMetrics) have been removed.
Metrics should be computed on-demand from the Essays table.
These endpoints return placeholder responses for backward compatibility.
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
    
    Note: Legacy ClassMetrics table removed. This endpoint returns placeholder data.
    Future implementation should compute metrics on-demand from Essays table.
    """
    if not essays_table:
        raise HTTPException(status_code=500, detail="Essays table not configured")
    
    try:
        # TODO: Compute metrics on-demand from Essays table
        # For now, return placeholder response
        logger.info("Class metrics requested (placeholder)", extra={
            "teacher_id": teacher_ctx.teacher_id,
            "assignment_id": assignment_id,
        })
        
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
    
    Note: Legacy StudentMetrics table removed. This endpoint returns placeholder data.
    Future implementation should compute metrics on-demand from Essays table.
    """
    if not essays_table:
        raise HTTPException(status_code=500, detail="Essays table not configured")
    
    try:
        # TODO: Compute metrics on-demand from Essays table
        # For now, return placeholder response
        logger.info("Student metrics requested (placeholder)", extra={
            "teacher_id": teacher_ctx.teacher_id,
            "student_id": student_id,
        })
        
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
        
    except Exception as e:
        logger.error("Failed to get student metrics", extra={
            "teacher_id": teacher_ctx.teacher_id,
            "student_id": student_id,
            "error": str(e),
        }, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve student metrics: {str(e)}")


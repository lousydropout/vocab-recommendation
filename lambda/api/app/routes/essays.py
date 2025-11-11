"""
Essay API routes for Epic 8.
Provides endpoints for essay retrieval and feedback overrides.
"""
import os
import json
import boto3
import logging
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict, Any
from pydantic import BaseModel

from app.deps import get_teacher_context, TeacherContext

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/essays", tags=["essays"])

# Initialize DynamoDB and SQS
dynamodb = boto3.resource('dynamodb')
sqs = boto3.client('sqs')
METRICS_TABLE = os.environ.get('METRICS_TABLE')
ESSAY_UPDATE_QUEUE_URL = os.environ.get('ESSAY_UPDATE_QUEUE_URL')

metrics_table = dynamodb.Table(METRICS_TABLE) if METRICS_TABLE else None


class FeedbackItem(BaseModel):
    """Model for a single feedback item."""
    word: str
    correct: bool
    comment: str


class EssayOverrideRequest(BaseModel):
    """Request model for essay feedback override."""
    feedback: List[FeedbackItem]


class EssayOverrideResponse(BaseModel):
    """Response model for essay override."""
    essay_id: str
    message: str


@router.patch("/{essay_id}/override", response_model=EssayOverrideResponse)
async def override_essay_feedback(
    essay_id: str,
    request: EssayOverrideRequest,
    teacher_ctx: TeacherContext = Depends(get_teacher_context)
):
    """
    Override AI feedback for a specific essay.
    
    Updates the feedback array in EssayMetrics and triggers metric re-computation.
    Logs the override to CloudWatch for audit purposes.
    """
    if not metrics_table:
        raise HTTPException(status_code=500, detail="Metrics table not configured")
    
    try:
        # First, get the existing essay to verify ownership
        response = metrics_table.get_item(
            Key={'essay_id': essay_id}
        )
        
        if 'Item' not in response:
            raise HTTPException(status_code=404, detail="Essay not found")
        
        essay = response['Item']
        
        # Verify teacher owns this essay
        essay_teacher_id = essay.get('teacher_id')
        if essay_teacher_id != teacher_ctx.teacher_id:
            raise HTTPException(status_code=403, detail="Not authorized to override this essay")
        
        # Convert feedback to dict format (DynamoDB compatible)
        feedback_list = [item.dict() for item in request.feedback]
        
        # Update the essay with new feedback
        from datetime import datetime
        update_expression = "SET #feedback = :feedback, #updated_at = :updated_at"
        expression_attribute_names = {
            '#feedback': 'feedback',
            '#updated_at': 'updated_at',
        }
        expression_attribute_values = {
            ':feedback': feedback_list,
            ':updated_at': datetime.utcnow().isoformat(),
        }
        
        metrics_table.update_item(
            Key={'essay_id': essay_id},
            UpdateExpression=update_expression,
            ExpressionAttributeNames=expression_attribute_names,
            ExpressionAttributeValues=expression_attribute_values,
        )
        
        # Log override for audit
        logger.info("Essay feedback overridden", extra={
            "teacher_id": teacher_ctx.teacher_id,
            "essay_id": essay_id,
            "feedback_items_count": len(feedback_list),
            "assignment_id": essay.get('assignment_id'),
            "student_id": essay.get('student_id'),
        })
        
        # Send message to EssayUpdateQueue to trigger metric re-computation
        if ESSAY_UPDATE_QUEUE_URL and essay.get('assignment_id') and essay.get('student_id'):
            try:
                sqs.send_message(
                    QueueUrl=ESSAY_UPDATE_QUEUE_URL,
                    MessageBody=json.dumps({
                        'teacher_id': teacher_ctx.teacher_id,
                        'assignment_id': essay.get('assignment_id'),
                        'student_id': essay.get('student_id'),
                        'essay_id': essay_id,
                        'override': True,  # Flag to indicate this is an override
                    }),
                )
                logger.info("Message sent to EssayUpdateQueue for override", extra={
                    "essay_id": essay_id,
                })
            except Exception as e:
                logger.error("Failed to send message to EssayUpdateQueue", extra={
                    "essay_id": essay_id,
                    "error": str(e),
                }, exc_info=True)
                # Don't fail the request if queue message fails
        
        return EssayOverrideResponse(
            essay_id=essay_id,
            message="Feedback override successful. Metrics will be recomputed.",
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to override essay feedback", extra={
            "teacher_id": teacher_ctx.teacher_id,
            "essay_id": essay_id,
            "error": str(e),
        }, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to override feedback: {str(e)}")


"""
Essay API routes.
Provides endpoints for essay batch upload, retrieval, and feedback overrides.
"""
import os
import json
import uuid
import boto3
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from boto3.dynamodb.conditions import Attr, Key

from app.deps import get_teacher_context, get_optional_teacher_context, TeacherContext

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/essays", tags=["essays"])

# Initialize DynamoDB and SQS
dynamodb = boto3.resource('dynamodb')
sqs = boto3.client('sqs')
ESSAYS_TABLE = os.environ.get('ESSAYS_TABLE')
ESSAY_PROCESSING_QUEUE_URL = os.environ.get('ESSAY_PROCESSING_QUEUE_URL')

essays_table = dynamodb.Table(ESSAYS_TABLE) if ESSAYS_TABLE else None
# Legacy METRICS_TABLE and ESSAY_UPDATE_QUEUE_URL removed - use Essays table instead


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


class EssayItem(BaseModel):
    """Model for a single essay in batch upload."""
    filename: str
    text: str


class BatchEssayRequest(BaseModel):
    """Request model for batch essay upload."""
    assignment_id: str
    student_id: Optional[str] = None
    essays: List[EssayItem]


class BatchEssayResponse(BaseModel):
    """Response model for a single essay in batch upload response."""
    essay_id: str
    status: str


class StudentEssayResponse(BaseModel):
    """Response model for a single student essay."""
    essay_id: str
    assignment_id: Optional[str] = None
    created_at: str
    metrics: Dict[str, Any]


class PublicEssayRequest(BaseModel):
    """Request model for public essay upload (demo)."""
    essay_text: str


class PublicEssayResponse(BaseModel):
    """Response model for public essay upload."""
    essay_id: str
    status: str


@router.post("/batch", response_model=List[BatchEssayResponse])
async def upload_batch_essays(
    request: BatchEssayRequest,
    teacher_ctx: TeacherContext = Depends(get_teacher_context)
):
    """
    Upload multiple essays in a batch.
    
    Creates DynamoDB records with status "pending" and enqueues SQS messages
    for async processing. Returns immediately with pending statuses.
    """
    if not essays_table:
        raise HTTPException(status_code=500, detail="Essays table not configured")
    
    if not ESSAY_PROCESSING_QUEUE_URL:
        raise HTTPException(status_code=500, detail="Processing queue not configured")
    
    if not request.essays:
        raise HTTPException(status_code=400, detail="No essays provided")
    
    results = []
    now = datetime.utcnow().isoformat()
    
    try:
        for essay_item in request.essays:
            essay_id = str(uuid.uuid4())
            
            # Create DynamoDB record with status "pending"
            essays_table.put_item(
                Item={
                    'assignment_id': request.assignment_id,
                    'essay_id': essay_id,
                    'teacher_id': teacher_ctx.teacher_id,
                    'student_id': request.student_id or '',
                    'essay_text': essay_item.text,
                    'status': 'pending',
                    'created_at': now,
                }
            )
            
            # Enqueue SQS message (ONLY IDs, no essay_text)
            sqs.send_message(
                QueueUrl=ESSAY_PROCESSING_QUEUE_URL,
                MessageBody=json.dumps({
                    'teacher_id': teacher_ctx.teacher_id,
                    'assignment_id': request.assignment_id,
                    'student_id': request.student_id or '',
                    'essay_id': essay_id,
                })
            )
            
            results.append(BatchEssayResponse(
                essay_id=essay_id,
                status='pending'
            ))
            
            logger.info("Essay enqueued for processing", extra={
                "teacher_id": teacher_ctx.teacher_id,
                "assignment_id": request.assignment_id,
                "student_id": request.student_id,
                "essay_id": essay_id,
            })
        
        logger.info("Batch upload complete", extra={
            "teacher_id": teacher_ctx.teacher_id,
            "assignment_id": request.assignment_id,
            "essay_count": len(results),
        })
        
        return results
        
    except Exception as e:
        logger.error("Failed to upload batch essays", extra={
            "teacher_id": teacher_ctx.teacher_id,
            "assignment_id": request.assignment_id,
            "error": str(e),
        }, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to upload essays: {str(e)}")


@router.post("/public", response_model=PublicEssayResponse)
async def upload_public_essay(request: PublicEssayRequest):
    """
    Public endpoint for demo essay upload (no authentication required).
    
    Creates a demo essay with a special assignment_id and processes it
    through the same async pipeline.
    """
    if not essays_table:
        raise HTTPException(status_code=500, detail="Essays table not configured")
    
    if not ESSAY_PROCESSING_QUEUE_URL:
        raise HTTPException(status_code=500, detail="Processing queue not configured")
    
    if not request.essay_text or not request.essay_text.strip():
        raise HTTPException(status_code=400, detail="Essay text is required")
    
    # Use a special demo assignment_id for public essays
    DEMO_ASSIGNMENT_ID = "demo-public-assignment"
    DEMO_TEACHER_ID = "demo-teacher"
    DEMO_STUDENT_ID = ""  # Empty string for unassigned
    
    essay_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    
    try:
        # Create DynamoDB record
        essays_table.put_item(
            Item={
                'assignment_id': DEMO_ASSIGNMENT_ID,
                'essay_id': essay_id,
                'teacher_id': DEMO_TEACHER_ID,
                'student_id': DEMO_STUDENT_ID,
                'essay_text': request.essay_text,
                'status': 'pending',
                'created_at': now,
            }
        )
        
        # Enqueue SQS message (only IDs, no essay_text)
        sqs.send_message(
            QueueUrl=ESSAY_PROCESSING_QUEUE_URL,
            MessageBody=json.dumps({
                'teacher_id': DEMO_TEACHER_ID,
                'assignment_id': DEMO_ASSIGNMENT_ID,
                'student_id': DEMO_STUDENT_ID,
                'essay_id': essay_id,
            })
        )
        
        logger.info("Public essay uploaded", extra={
            "essay_id": essay_id,
            "assignment_id": DEMO_ASSIGNMENT_ID,
        })
        
        return PublicEssayResponse(
            essay_id=essay_id,
            status="pending"
        )
    except Exception as e:
        logger.error("Failed to upload public essay", extra={
            "error": str(e),
        }, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to upload essay: {str(e)}")


@router.get("/assignment/{assignment_id}", response_model=List[Dict[str, Any]])
async def list_assignment_essays(
    assignment_id: str,
    teacher_ctx: TeacherContext = Depends(get_teacher_context)
):
    """
    List all essays for a specific assignment.
    
    Returns essays with their vocabulary_analysis for the given assignment_id.
    Only returns essays that belong to the authenticated teacher.
    Returns all essays regardless of status (pending or processed).
    """
    if not essays_table:
        raise HTTPException(status_code=500, detail="Essays table not configured")
    
    try:
        essays = []
        
        # Query essays by assignment_id (partition key)
        # Filter by teacher_id only (include both pending and processed)
        response = essays_table.query(
            KeyConditionExpression=Key('assignment_id').eq(assignment_id),
            FilterExpression=Attr('teacher_id').eq(teacher_ctx.teacher_id)
        )
        
        essays.extend(response.get('Items', []))
        
        # Handle pagination
        while 'LastEvaluatedKey' in response:
            response = essays_table.query(
                KeyConditionExpression=Key('assignment_id').eq(assignment_id),
                FilterExpression=Attr('teacher_id').eq(teacher_ctx.teacher_id),
                ExclusiveStartKey=response['LastEvaluatedKey']
            )
            essays.extend(response.get('Items', []))
        
        # Format response
        result = []
        for essay in essays:
            essay_data = {
                'essay_id': essay.get('essay_id'),
                'assignment_id': essay.get('assignment_id'),
                'student_id': essay.get('student_id'),
                'status': essay.get('status', 'pending'),
                'created_at': essay.get('created_at'),
                'processed_at': essay.get('processed_at'),
            }
            
            # Include vocabulary_analysis if available
            if 'vocabulary_analysis' in essay:
                essay_data['vocabulary_analysis'] = essay['vocabulary_analysis']
            
            result.append(essay_data)
        
        logger.info("Assignment essays retrieved", extra={
            "teacher_id": teacher_ctx.teacher_id,
            "assignment_id": assignment_id,
            "essay_count": len(result),
        })
        
        return result
        
    except Exception as e:
        logger.error("Failed to list assignment essays", extra={
            "teacher_id": teacher_ctx.teacher_id,
            "assignment_id": assignment_id,
            "error": str(e),
        }, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve assignment essays: {str(e)}")


@router.get("/student/{student_id}", response_model=List[StudentEssayResponse])
async def list_student_essays(
    student_id: str,
    teacher_ctx: TeacherContext = Depends(get_teacher_context)
):
    """
    List all processed essays for a specific student.
    
    Returns essays sorted by created_at (ascending) with their vocabulary_analysis.
    Only returns essays that belong to the authenticated teacher.
    """
    if not essays_table:
        raise HTTPException(status_code=500, detail="Essays table not configured")
    
    try:
        essays = []
        
        # Scan with filter to get all essays for this student
        # Note: This is a scan operation - consider adding GSI if performance becomes an issue
        response = essays_table.scan(
            FilterExpression=Attr('teacher_id').eq(teacher_ctx.teacher_id) &
                            Attr('student_id').eq(student_id) &
                            Attr('status').eq('processed')
        )
        
        essays.extend(response.get('Items', []))
        
        # Handle pagination
        while 'LastEvaluatedKey' in response:
            response = essays_table.scan(
                FilterExpression=Attr('teacher_id').eq(teacher_ctx.teacher_id) &
                                Attr('student_id').eq(student_id) &
                                Attr('status').eq('processed'),
                ExclusiveStartKey=response['LastEvaluatedKey']
            )
            essays.extend(response.get('Items', []))
        
        # Sort essays by created_at (ascending)
        essays.sort(key=lambda x: x.get('created_at', ''))
        
        # Format response
        result = []
        for essay in essays:
            # Convert vocabulary_analysis to metrics format for backward compatibility
            vocab_analysis = essay.get('vocabulary_analysis', {})
            result.append(StudentEssayResponse(
                essay_id=essay.get('essay_id'),
                assignment_id=essay.get('assignment_id'),
                created_at=essay.get('created_at', ''),
                metrics=vocab_analysis  # Use vocabulary_analysis as metrics
            ))
        
        logger.info("Student essays retrieved", extra={
            "teacher_id": teacher_ctx.teacher_id,
            "student_id": student_id,
            "essay_count": len(result),
        })
        
        return result
        
    except Exception as e:
        logger.error("Failed to list student essays", extra={
            "teacher_id": teacher_ctx.teacher_id,
            "student_id": student_id,
            "error": str(e),
        }, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve student essays: {str(e)}")


@router.get("/{essay_id}")
async def get_essay(
    essay_id: str,
    teacher_ctx: Optional[TeacherContext] = Depends(get_optional_teacher_context)
):
    """
    Retrieve essay analysis results.
    
    Queries the Essays table using assignment_id and essay_id.
    Works for both authenticated users (their essays) and public demo essays.
    """
    if not essays_table:
        raise HTTPException(status_code=500, detail="Essays table not configured")
    
    try:
        # First, we need to find the essay by scanning (since we only have essay_id)
        # In production, consider adding a GSI on essay_id
        filter_expr = Attr('essay_id').eq(essay_id)
        
        # If authenticated, filter by teacher_id; if not, allow public essays (demo-teacher)
        if teacher_ctx:
            filter_expr = filter_expr & Attr('teacher_id').eq(teacher_ctx.teacher_id)
        else:
            # Allow public demo essays
            filter_expr = filter_expr & Attr('teacher_id').eq('demo-teacher')
        
        response = essays_table.scan(FilterExpression=filter_expr)
        
        items = response.get('Items', [])
        if not items:
            raise HTTPException(status_code=404, detail="Essay not found")
        
        essay = items[0]
        
        # Verify authorization: authenticated users can only see their own essays
        # Unauthenticated users can only see public demo essays
        if teacher_ctx and essay.get('teacher_id') != teacher_ctx.teacher_id:
            raise HTTPException(status_code=403, detail="Not authorized to view this essay")
        elif not teacher_ctx and essay.get('teacher_id') != 'demo-teacher':
            raise HTTPException(status_code=403, detail="Not authorized to view this essay")
        
        # Format response
        result = {
            'essay_id': essay.get('essay_id'),
            'assignment_id': essay.get('assignment_id'),
            'student_id': essay.get('student_id'),
            'status': essay.get('status', 'pending'),
            'created_at': essay.get('created_at'),
            'processed_at': essay.get('processed_at'),
        }
        
        # Include vocabulary_analysis if processed
        if essay.get('status') == 'processed' and 'vocabulary_analysis' in essay:
            result['vocabulary_analysis'] = essay['vocabulary_analysis']
        
        logger.info("Essay retrieved", extra={
            "teacher_id": teacher_ctx.teacher_id if teacher_ctx else "public",
            "essay_id": essay_id,
            "status": essay.get('status'),
        })
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to retrieve essay", extra={
            "teacher_id": teacher_ctx.teacher_id if teacher_ctx else "public",
            "essay_id": essay_id,
            "error": str(e),
        }, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve essay: {str(e)}")


@router.patch("/{essay_id}/override", response_model=EssayOverrideResponse)
async def override_essay_feedback(
    essay_id: str,
    request: EssayOverrideRequest,
    teacher_ctx: TeacherContext = Depends(get_teacher_context)
):
    """
    Override AI feedback for a specific essay.
    
    Updates the feedback array in Essays table.
    Note: This endpoint is kept for backward compatibility but feedback override
    functionality may need to be redesigned for the new vocabulary_analysis schema.
    """
    if not essays_table:
        raise HTTPException(status_code=500, detail="Essays table not configured")
    
    try:
        # First, find the essay by scanning (since we only have essay_id)
        # In production, consider adding a GSI on essay_id
        response = essays_table.scan(
            FilterExpression=Attr('essay_id').eq(essay_id) &
                            Attr('teacher_id').eq(teacher_ctx.teacher_id)
        )
        
        items = response.get('Items', [])
        if not items:
            raise HTTPException(status_code=404, detail="Essay not found")
        
        essay = items[0]
        assignment_id = essay.get('assignment_id')
        
        # Convert feedback to dict format (DynamoDB compatible)
        feedback_list = [item.dict() for item in request.feedback]
        
        # Update the essay with new feedback
        # Store feedback in vocabulary_analysis or as a separate field
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
        
        essays_table.update_item(
            Key={'assignment_id': assignment_id, 'essay_id': essay_id},
            UpdateExpression=update_expression,
            ExpressionAttributeNames=expression_attribute_names,
            ExpressionAttributeValues=expression_attribute_values,
        )
        
        # Log override for audit
        logger.info("Essay feedback overridden", extra={
            "teacher_id": teacher_ctx.teacher_id,
            "essay_id": essay_id,
            "feedback_items_count": len(feedback_list),
            "assignment_id": assignment_id,
            "student_id": essay.get('student_id'),
        })
        
        # Note: EssayUpdateQueue removed - metrics are no longer pre-computed
        # If metrics are needed, they should be computed on-demand from Essays table
        
        return EssayOverrideResponse(
            essay_id=essay_id,
            message="Feedback override successful.",
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


"""
API routes for assignment management.
"""
import os
import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
import boto3

from app.deps import get_teacher_context, TeacherContext
from app.db.assignments import (
    create_assignment,
    get_assignment,
    list_assignments,
)

logger = logging.getLogger()

router = APIRouter(prefix="/assignments", tags=["assignments"])

# Initialize S3 client
s3_client = boto3.client('s3')
ESSAYS_BUCKET = os.environ.get('ESSAYS_BUCKET')


class AssignmentCreate(BaseModel):
    name: str
    description: Optional[str] = None


class AssignmentResponse(BaseModel):
    teacher_id: str
    assignment_id: str
    name: str
    description: str
    created_at: str
    updated_at: str


class UploadUrlRequest(BaseModel):
    file_name: str


class UploadUrlResponse(BaseModel):
    presigned_url: str
    expires_in: int
    file_key: str


@router.post("", response_model=AssignmentResponse, status_code=status.HTTP_201_CREATED)
async def create_assignment_endpoint(
    assignment: AssignmentCreate,
    teacher_ctx: TeacherContext = Depends(get_teacher_context)
):
    """Create a new assignment"""
    try:
        assignment_record = create_assignment(
            teacher_id=teacher_ctx.teacher_id,
            name=assignment.name,
            description=assignment.description,
        )
        return assignment_record
    except Exception as e:
        logger.error("Failed to create assignment", extra={
            "teacher_id": teacher_ctx.teacher_id,
            "error": str(e),
        }, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create assignment: {str(e)}"
        )


@router.get("", response_model=List[AssignmentResponse])
async def list_assignments_endpoint(
    teacher_ctx: TeacherContext = Depends(get_teacher_context)
):
    """List all assignments for the teacher"""
    try:
        assignments = list_assignments(teacher_ctx.teacher_id)
        return assignments
    except Exception as e:
        logger.error("Failed to list assignments", extra={
            "teacher_id": teacher_ctx.teacher_id,
            "error": str(e),
        }, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list assignments: {str(e)}"
        )


@router.get("/{assignment_id}", response_model=AssignmentResponse)
async def get_assignment_endpoint(
    assignment_id: str,
    teacher_ctx: TeacherContext = Depends(get_teacher_context)
):
    """Get a specific assignment"""
    assignment = get_assignment(teacher_ctx.teacher_id, assignment_id)
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found"
        )
    return assignment


@router.post("/{assignment_id}/upload-url", response_model=UploadUrlResponse)
async def get_upload_url_endpoint(
    assignment_id: str,
    request: UploadUrlRequest,
    teacher_ctx: TeacherContext = Depends(get_teacher_context)
):
    """Get presigned URL for uploading files to an assignment"""
    # Verify assignment exists and belongs to teacher
    assignment = get_assignment(teacher_ctx.teacher_id, assignment_id)
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found"
        )
    
    if not ESSAYS_BUCKET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="S3 bucket not configured"
        )
    
    # Generate file key: {teacher_id}/assignments/{assignment_id}/{file_name}
    file_key = f"{teacher_ctx.teacher_id}/assignments/{assignment_id}/{request.file_name}"
    
    try:
        # Generate presigned URL (expires in 15 minutes)
        presigned_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': ESSAYS_BUCKET,
                'Key': file_key,
            },
            ExpiresIn=900  # 15 minutes
        )
        
        logger.info("Presigned URL generated", extra={
            "teacher_id": teacher_ctx.teacher_id,
            "assignment_id": assignment_id,
            "file_key": file_key,
        })
        
        return UploadUrlResponse(
            presigned_url=presigned_url,
            expires_in=900,
            file_key=file_key,
        )
    except Exception as e:
        logger.error("Failed to generate presigned URL", extra={
            "teacher_id": teacher_ctx.teacher_id,
            "assignment_id": assignment_id,
            "error": str(e),
        }, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate upload URL: {str(e)}"
        )


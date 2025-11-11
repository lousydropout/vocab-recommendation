"""
API routes for student management.
"""
import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel

from app.deps import get_teacher_context, TeacherContext
from app.db.students import (
    create_student,
    get_student,
    list_students,
    update_student,
    delete_student,
)

logger = logging.getLogger()

router = APIRouter(prefix="/students", tags=["students"])


class StudentCreate(BaseModel):
    name: str
    grade_level: Optional[int] = None
    notes: Optional[str] = None


class StudentUpdate(BaseModel):
    name: Optional[str] = None
    grade_level: Optional[int] = None
    notes: Optional[str] = None


class StudentResponse(BaseModel):
    teacher_id: str
    student_id: str
    name: str
    grade_level: Optional[int]
    notes: str
    created_at: str
    updated_at: str


@router.post("", response_model=StudentResponse, status_code=status.HTTP_201_CREATED)
async def create_student_endpoint(
    student: StudentCreate,
    teacher_ctx: TeacherContext = Depends(get_teacher_context)
):
    """Create a new student"""
    try:
        student_record = create_student(
            teacher_id=teacher_ctx.teacher_id,
            name=student.name,
            grade_level=student.grade_level,
            notes=student.notes,
        )
        return student_record
    except Exception as e:
        logger.error("Failed to create student", extra={
            "teacher_id": teacher_ctx.teacher_id,
            "error": str(e),
        }, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create student: {str(e)}"
        )


@router.get("", response_model=List[StudentResponse])
async def list_students_endpoint(
    teacher_ctx: TeacherContext = Depends(get_teacher_context)
):
    """List all students for the teacher"""
    try:
        students = list_students(teacher_ctx.teacher_id)
        return students
    except Exception as e:
        logger.error("Failed to list students", extra={
            "teacher_id": teacher_ctx.teacher_id,
            "error": str(e),
        }, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list students: {str(e)}"
        )


@router.get("/{student_id}", response_model=StudentResponse)
async def get_student_endpoint(
    student_id: str,
    teacher_ctx: TeacherContext = Depends(get_teacher_context)
):
    """Get a specific student"""
    student = get_student(teacher_ctx.teacher_id, student_id)
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found"
        )
    return student


@router.patch("/{student_id}", response_model=StudentResponse)
async def update_student_endpoint(
    student_id: str,
    student_update: StudentUpdate,
    teacher_ctx: TeacherContext = Depends(get_teacher_context)
):
    """Update a student"""
    # Verify student exists and belongs to teacher
    existing = get_student(teacher_ctx.teacher_id, student_id)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found"
        )
    
    try:
        updated = update_student(
            teacher_id=teacher_ctx.teacher_id,
            student_id=student_id,
            name=student_update.name,
            grade_level=student_update.grade_level,
            notes=student_update.notes,
        )
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update student"
            )
        return updated
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update student", extra={
            "teacher_id": teacher_ctx.teacher_id,
            "student_id": student_id,
            "error": str(e),
        }, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update student: {str(e)}"
        )


@router.delete("/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_student_endpoint(
    student_id: str,
    teacher_ctx: TeacherContext = Depends(get_teacher_context)
):
    """Delete a student"""
    # Verify student exists and belongs to teacher
    existing = get_student(teacher_ctx.teacher_id, student_id)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found"
        )
    
    success = delete_student(teacher_ctx.teacher_id, student_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete student"
        )


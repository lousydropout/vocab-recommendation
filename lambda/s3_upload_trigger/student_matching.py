"""
Student matching and creation logic.
"""
import os
import logging
from typing import Optional, Dict
import boto3
from boto3.dynamodb.conditions import Key
from rapidfuzz import fuzz
from name_extraction import normalize_name

logger = logging.getLogger()

# Initialize DynamoDB
dynamodb = boto3.resource('dynamodb')
STUDENTS_TABLE = os.environ.get('STUDENTS_TABLE')
students_table = dynamodb.Table(STUDENTS_TABLE) if STUDENTS_TABLE else None


def find_matching_student(teacher_id: str, candidate_name: str, threshold: int = 85) -> Optional[Dict]:
    """
    Find existing student by fuzzy matching name.
    
    Args:
        teacher_id: Teacher ID
        candidate_name: Name to match
        threshold: Minimum similarity score (0-100)
    
    Returns:
        Matching student record if found, None otherwise
    """
    if not students_table:
        logger.error("STUDENTS_TABLE environment variable not set")
        return None
    
    if not candidate_name:
        return None
    
    normalized_candidate = normalize_name(candidate_name)
    
    try:
        # Query all students for this teacher
        response = students_table.query(
            KeyConditionExpression=Key('teacher_id').eq(teacher_id)
        )
        
        students = response.get('Items', [])
        best_match = None
        best_score = 0
        
        for student in students:
            student_name = student.get('name', '')
            normalized_student = normalize_name(student_name)
            
            # Calculate similarity using rapidfuzz
            score = fuzz.ratio(normalized_candidate, normalized_student)
            
            if score >= threshold and score > best_score:
                best_score = score
                best_match = student
        
        if best_match:
            logger.info("Student matched", extra={
                "teacher_id": teacher_id,
                "candidate_name": candidate_name,
                "matched_name": best_match.get('name'),
                "score": best_score,
            })
        else:
            logger.debug("No student match found", extra={
                "teacher_id": teacher_id,
                "candidate_name": candidate_name,
                "threshold": threshold,
            })
        
        return best_match
        
    except Exception as e:
        logger.error("Failed to find matching student", extra={
            "teacher_id": teacher_id,
            "candidate_name": candidate_name,
            "error": str(e),
        }, exc_info=True)
        return None


def get_or_create_student(teacher_id: str, name: str) -> Dict:
    """
    Get existing student by name match, or create new student.
    
    Returns:
        Student record (existing or newly created)
    """
    if not students_table:
        logger.error("STUDENTS_TABLE environment variable not set")
        raise ValueError("Students table not configured")
    
    # Try to find matching student
    matched = find_matching_student(teacher_id, name, threshold=85)
    if matched:
        return matched
    
    # Create new student
    import uuid
    from datetime import datetime
    
    student_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    
    student_item = {
        'teacher_id': teacher_id,
        'student_id': student_id,
        'name': name,
        'grade_level': None,
        'notes': '',
        'created_at': now,
        'updated_at': now,
    }
    
    try:
        students_table.put_item(Item=student_item)
        logger.info("New student created", extra={
            "teacher_id": teacher_id,
            "student_id": student_id,
            "name": name,
        })
        return student_item
    except Exception as e:
        logger.error("Failed to create student", extra={
            "teacher_id": teacher_id,
            "name": name,
            "error": str(e),
        }, exc_info=True)
        raise


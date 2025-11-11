"""
Database operations for Students table.
"""
import os
import logging
from datetime import datetime
from typing import Optional, Dict, List
import boto3
from boto3.dynamodb.conditions import Key

logger = logging.getLogger()

# Initialize DynamoDB
dynamodb = boto3.resource('dynamodb')
STUDENTS_TABLE = os.environ.get('STUDENTS_TABLE')
table = dynamodb.Table(STUDENTS_TABLE) if STUDENTS_TABLE else None


def create_student(teacher_id: str, name: str, grade_level: Optional[int] = None, notes: Optional[str] = None) -> Dict:
    """
    Create a new student record.
    
    Args:
        teacher_id: Teacher ID (partition key)
        name: Student name
        grade_level: Optional grade level
        notes: Optional notes
    
    Returns:
        Created student record
    """
    if not table:
        logger.error("STUDENTS_TABLE environment variable not set")
        raise ValueError("Students table not configured")
    
    import uuid
    student_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    
    student_item = {
        'teacher_id': teacher_id,
        'student_id': student_id,
        'name': name,
        'grade_level': grade_level,
        'notes': notes or '',
        'created_at': now,
        'updated_at': now,
    }
    
    try:
        table.put_item(Item=student_item)
        logger.info("Student created", extra={
            "teacher_id": teacher_id,
            "student_id": student_id,
            "student_name": name,
        })
        return student_item
    except Exception as e:
        logger.error("Failed to create student", extra={
            "teacher_id": teacher_id,
            "student_name": name,
            "error": str(e),
        }, exc_info=True)
        raise


def get_student(teacher_id: str, student_id: str) -> Optional[Dict]:
    """
    Get student record by teacher_id and student_id.
    
    Returns:
        Student record if found, None otherwise
    """
    if not table:
        logger.error("STUDENTS_TABLE environment variable not set")
        return None
    
    try:
        response = table.get_item(
            Key={
                'teacher_id': teacher_id,
                'student_id': student_id,
            }
        )
        if 'Item' in response:
            return response['Item']
        return None
    except Exception as e:
        logger.error("Failed to get student", extra={
            "teacher_id": teacher_id,
            "student_id": student_id,
            "error": str(e),
        })
        return None


def list_students(teacher_id: str) -> List[Dict]:
    """
    List all students for a teacher.
    
    Returns:
        List of student records
    """
    if not table:
        logger.error("STUDENTS_TABLE environment variable not set")
        return []
    
    try:
        response = table.query(
            KeyConditionExpression=Key('teacher_id').eq(teacher_id)
        )
        students = response.get('Items', [])
        logger.info("Listed students", extra={
            "teacher_id": teacher_id,
            "count": len(students),
        })
        return students
    except Exception as e:
        logger.error("Failed to list students", extra={
            "teacher_id": teacher_id,
            "error": str(e),
        }, exc_info=True)
        return []


def update_student(teacher_id: str, student_id: str, name: Optional[str] = None, 
                   grade_level: Optional[int] = None, notes: Optional[str] = None) -> Optional[Dict]:
    """
    Update student record.
    
    Returns:
        Updated student record if successful, None otherwise
    """
    if not table:
        logger.error("STUDENTS_TABLE environment variable not set")
        return None
    
    now = datetime.utcnow().isoformat()
    
    try:
        update_expression_parts = ['SET updated_at = :updated_at']
        expression_attribute_values = {':updated_at': now}
        expression_attribute_names = {}
        
        if name is not None:
            update_expression_parts.append('#name = :name')
            expression_attribute_values[':name'] = name
            expression_attribute_names['#name'] = 'name'
        
        if grade_level is not None:
            update_expression_parts.append('grade_level = :grade_level')
            expression_attribute_values[':grade_level'] = grade_level
        
        if notes is not None:
            update_expression_parts.append('notes = :notes')
            expression_attribute_values[':notes'] = notes
        
        update_expression = ', '.join(update_expression_parts)
        
        table.update_item(
            Key={
                'teacher_id': teacher_id,
                'student_id': student_id,
            },
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_attribute_values,
            ExpressionAttributeNames=expression_attribute_names if expression_attribute_names else None,
            ReturnValues='ALL_NEW'
        )
        
        logger.info("Student updated", extra={
            "teacher_id": teacher_id,
            "student_id": student_id,
        })
        
        # Return updated item
        return get_student(teacher_id, student_id)
        
    except Exception as e:
        logger.error("Failed to update student", extra={
            "teacher_id": teacher_id,
            "student_id": student_id,
            "error": str(e),
        }, exc_info=True)
        return None


def delete_student(teacher_id: str, student_id: str) -> bool:
    """
    Delete student record.
    
    Returns:
        True if successful, False otherwise
    """
    if not table:
        logger.error("STUDENTS_TABLE environment variable not set")
        return False
    
    try:
        table.delete_item(
            Key={
                'teacher_id': teacher_id,
                'student_id': student_id,
            }
        )
        logger.info("Student deleted", extra={
            "teacher_id": teacher_id,
            "student_id": student_id,
        })
        return True
    except Exception as e:
        logger.error("Failed to delete student", extra={
            "teacher_id": teacher_id,
            "student_id": student_id,
            "error": str(e),
        }, exc_info=True)
        return False


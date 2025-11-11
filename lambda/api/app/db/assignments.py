"""
Database operations for Assignments table.
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
ASSIGNMENTS_TABLE = os.environ.get('ASSIGNMENTS_TABLE')
table = dynamodb.Table(ASSIGNMENTS_TABLE) if ASSIGNMENTS_TABLE else None


def create_assignment(teacher_id: str, name: str, description: Optional[str] = None) -> Dict:
    """
    Create a new assignment record.
    
    Args:
        teacher_id: Teacher ID (partition key)
        name: Assignment name
        description: Optional description
    
    Returns:
        Created assignment record
    """
    if not table:
        logger.error("ASSIGNMENTS_TABLE environment variable not set")
        raise ValueError("Assignments table not configured")
    
    import uuid
    assignment_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    
    assignment_item = {
        'teacher_id': teacher_id,
        'assignment_id': assignment_id,
        'name': name,
        'description': description or '',
        'created_at': now,
        'updated_at': now,
    }
    
    try:
        table.put_item(Item=assignment_item)
        logger.info("Assignment created", extra={
            "teacher_id": teacher_id,
            "assignment_id": assignment_id,
            "assignment_name": name,
        })
        return assignment_item
    except Exception as e:
        logger.error("Failed to create assignment", extra={
            "teacher_id": teacher_id,
            "assignment_name": name,
            "error": str(e),
        }, exc_info=True)
        raise


def get_assignment(teacher_id: str, assignment_id: str) -> Optional[Dict]:
    """
    Get assignment record by teacher_id and assignment_id.
    
    Returns:
        Assignment record if found, None otherwise
    """
    if not table:
        logger.error("ASSIGNMENTS_TABLE environment variable not set")
        return None
    
    try:
        response = table.get_item(
            Key={
                'teacher_id': teacher_id,
                'assignment_id': assignment_id,
            }
        )
        if 'Item' in response:
            return response['Item']
        return None
    except Exception as e:
        logger.error("Failed to get assignment", extra={
            "teacher_id": teacher_id,
            "assignment_id": assignment_id,
            "error": str(e),
        })
        return None


def list_assignments(teacher_id: str) -> List[Dict]:
    """
    List all assignments for a teacher.
    
    Returns:
        List of assignment records
    """
    if not table:
        logger.error("ASSIGNMENTS_TABLE environment variable not set")
        return []
    
    try:
        response = table.query(
            KeyConditionExpression=Key('teacher_id').eq(teacher_id)
        )
        assignments = response.get('Items', [])
        logger.info("Listed assignments", extra={
            "teacher_id": teacher_id,
            "count": len(assignments),
        })
        return assignments
    except Exception as e:
        logger.error("Failed to list assignments", extra={
            "teacher_id": teacher_id,
            "error": str(e),
        }, exc_info=True)
        return []


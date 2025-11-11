"""
Database operations for Teachers table.
"""
import os
import logging
from datetime import datetime
from typing import Optional, Dict
import boto3
from boto3.dynamodb.conditions import Key

logger = logging.getLogger()

# Initialize DynamoDB
dynamodb = boto3.resource('dynamodb')
TEACHERS_TABLE = os.environ.get('TEACHERS_TABLE')
table = dynamodb.Table(TEACHERS_TABLE) if TEACHERS_TABLE else None


def get_or_create_teacher(teacher_id: str, email: Optional[str] = None, name: Optional[str] = None) -> Dict:
    """
    Get teacher record from DynamoDB, or create if it doesn't exist.
    
    Args:
        teacher_id: Cognito sub (subject) - used as partition key
        email: Teacher email address
        name: Teacher full name (optional)
    
    Returns:
        Teacher record dictionary
    """
    if not table:
        logger.error("TEACHERS_TABLE environment variable not set")
        raise ValueError("Teachers table not configured")
    
    now = datetime.utcnow().isoformat()
    
    try:
        # Try to get existing teacher
        response = table.get_item(Key={'teacher_id': teacher_id})
        
        if 'Item' in response:
            logger.info("Teacher record found", extra={"teacher_id": teacher_id})
            return response['Item']
        
        # Teacher doesn't exist, create new record
        logger.info("Creating new teacher record", extra={
            "teacher_id": teacher_id,
            "email": email,
        })
        
        teacher_item = {
            'teacher_id': teacher_id,
            'email': email or '',
            'name': name or '',
            'created_at': now,
            'updated_at': now,
        }
        
        table.put_item(Item=teacher_item)
        logger.info("Teacher record created", extra={"teacher_id": teacher_id})
        
        return teacher_item
        
    except Exception as e:
        logger.error("Failed to get or create teacher", extra={
            "teacher_id": teacher_id,
            "error": str(e),
        }, exc_info=True)
        raise


def get_teacher(teacher_id: str) -> Optional[Dict]:
    """
    Get teacher record by teacher_id.
    
    Returns:
        Teacher record if found, None otherwise
    """
    if not table:
        logger.error("TEACHERS_TABLE environment variable not set")
        return None
    
    try:
        response = table.get_item(Key={'teacher_id': teacher_id})
        if 'Item' in response:
            return response['Item']
        return None
    except Exception as e:
        logger.error("Failed to get teacher", extra={
            "teacher_id": teacher_id,
            "error": str(e),
        })
        return None


def update_teacher(teacher_id: str, email: Optional[str] = None, name: Optional[str] = None) -> Optional[Dict]:
    """
    Update teacher record.
    
    Returns:
        Updated teacher record if successful, None otherwise
    """
    if not table:
        logger.error("TEACHERS_TABLE environment variable not set")
        return None
    
    now = datetime.utcnow().isoformat()
    
    try:
        update_expression_parts = ['SET updated_at = :updated_at']
        expression_attribute_values = {':updated_at': now}
        
        if email is not None:
            update_expression_parts.append('email = :email')
            expression_attribute_values[':email'] = email
        
        if name is not None:
            update_expression_parts.append('#name = :name')
            expression_attribute_values[':name'] = name
        
        update_expression = ', '.join(update_expression_parts)
        
        # Use ExpressionAttributeNames for reserved keywords
        expression_attribute_names = {}
        if name is not None:
            expression_attribute_names['#name'] = 'name'
        
        table.update_item(
            Key={'teacher_id': teacher_id},
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_attribute_values,
            ExpressionAttributeNames=expression_attribute_names if expression_attribute_names else None,
            ReturnValues='ALL_NEW'
        )
        
        logger.info("Teacher record updated", extra={"teacher_id": teacher_id})
        
        # Return updated item
        response = table.get_item(Key={'teacher_id': teacher_id})
        if 'Item' in response:
            return response['Item']
        return None
        
    except Exception as e:
        logger.error("Failed to update teacher", extra={
            "teacher_id": teacher_id,
            "error": str(e),
        }, exc_info=True)
        return None


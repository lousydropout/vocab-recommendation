import os
import json
import boto3
import logging
import zipfile
import io
import re
from typing import List, Dict, Optional, Tuple

from name_extraction import extract_student_name_from_text
from student_matching import get_or_create_student

# Configure structured logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

sqs = boto3.client('sqs')
s3_client = boto3.client('s3')

PROCESSING_QUEUE_URL = os.environ['PROCESSING_QUEUE_URL']
ESSAYS_BUCKET = os.environ.get('ESSAYS_BUCKET')
ASSIGNMENTS_TABLE = os.environ.get('ASSIGNMENTS_TABLE')

# Initialize DynamoDB for assignments lookup
dynamodb = boto3.resource('dynamodb')
assignments_table = dynamodb.Table(ASSIGNMENTS_TABLE) if ASSIGNMENTS_TABLE else None


def parse_s3_key(key: str) -> Tuple[Optional[str], Optional[str], Optional[str], str]:
    """
    Parse S3 key to extract teacher_id, assignment_id, and file info.
    
    Key formats:
    - Legacy: essays/{essay_id}.txt
    - Assignment: {teacher_id}/assignments/{assignment_id}/{file_name}
    
    Returns:
        (teacher_id, assignment_id, file_name, file_type)
    """
    # Legacy format: essays/{essay_id}.txt
    if key.startswith('essays/'):
        essay_id = key.replace('essays/', '').replace('.txt', '')
        return None, None, essay_id, 'legacy'
    
    # Assignment format: {teacher_id}/assignments/{assignment_id}/{file_name}
    assignment_pattern = re.compile(r'^([^/]+)/assignments/([^/]+)/(.+)$')
    match = assignment_pattern.match(key)
    if match:
        teacher_id = match.group(1)
        assignment_id = match.group(2)
        file_name = match.group(3)
        file_type = 'zip' if file_name.endswith('.zip') else 'essay'
        return teacher_id, assignment_id, file_name, file_type
    
    # Unknown format
    logger.warning("Unknown S3 key format", extra={"key": key})
    return None, None, key, 'unknown'


def extract_zip_contents(bucket: str, key: str) -> List[Tuple[str, str]]:
    """
    Extract text files from a zip archive in S3.
    
    Returns:
        List of (file_name, content) tuples
    """
    try:
        # Download zip file from S3
        response = s3_client.get_object(Bucket=bucket, Key=key)
        zip_data = response['Body'].read()
        
        # Extract files
        extracted_files = []
        with zipfile.ZipFile(io.BytesIO(zip_data), 'r') as zip_ref:
            for file_info in zip_ref.namelist():
                # Only process .txt and .md files
                if file_info.endswith('.txt') or file_info.endswith('.md'):
                    try:
                        content = zip_ref.read(file_info).decode('utf-8')
                        extracted_files.append((file_info, content))
                        logger.debug("Extracted file from zip", extra={
                            "zip_key": key,
                            "file_name": file_info,
                            "content_length": len(content),
                        })
                    except Exception as e:
                        logger.warning("Failed to extract file from zip", extra={
                            "zip_key": key,
                            "file_name": file_info,
                            "error": str(e),
                        })
                        continue
        
        logger.info("Zip extraction complete", extra={
            "zip_key": key,
            "files_extracted": len(extracted_files),
        })
        return extracted_files
        
    except Exception as e:
        logger.error("Failed to extract zip file", extra={
            "bucket": bucket,
            "key": key,
            "error": str(e),
        }, exc_info=True)
        raise


def process_single_essay(
    bucket: str,
    teacher_id: Optional[str],
    assignment_id: Optional[str],
    file_key: str,
    essay_text: str
) -> Optional[Dict]:
    """
    Process a single essay file:
    1. Extract student name
    2. Match or create student
    3. Upload to S3
    4. Send SQS message
    
    Returns:
        SQS message body if successful, None otherwise
    """
    import uuid
    
    # Extract student name from essay text
    student_name = extract_student_name_from_text(essay_text)
    
    # Get or create student (if teacher_id is available)
    student_id = None
    if teacher_id and student_name:
        try:
            student = get_or_create_student(teacher_id, student_name)
            student_id = student['student_id']
            logger.info("Student resolved", extra={
                "teacher_id": teacher_id,
                "student_id": student_id,
                "student_name": student_name,
            })
        except Exception as e:
            logger.error("Failed to get or create student", extra={
                "teacher_id": teacher_id,
                "student_name": student_name,
                "error": str(e),
            })
            # Continue processing even if student creation fails
    
    # Generate essay_id
    essay_id = str(uuid.uuid4())
    
    # Determine S3 key for essay
    if teacher_id and assignment_id:
        # New format: {teacher_id}/assignments/{assignment_id}/essays/{essay_id}.txt
        essay_s3_key = f"{teacher_id}/assignments/{assignment_id}/essays/{essay_id}.txt"
    else:
        # Legacy format: essays/{essay_id}.txt
        essay_s3_key = f"essays/{essay_id}.txt"
    
    # Upload essay to S3
    try:
        s3_client.put_object(
            Bucket=bucket,
            Key=essay_s3_key,
            Body=essay_text.encode('utf-8'),
            ContentType='text/plain',
        )
        logger.info("Essay uploaded to S3", extra={
            "essay_id": essay_id,
            "s3_key": essay_s3_key,
        })
    except Exception as e:
        logger.error("Failed to upload essay to S3", extra={
            "essay_id": essay_id,
            "s3_key": essay_s3_key,
            "error": str(e),
        })
        return None
    
    # Create SQS message
    message_body = {
        'essay_id': essay_id,
        'file_key': essay_s3_key,
        'bucket': bucket,
    }
    
    # Add assignment metadata if available
    if teacher_id:
        message_body['teacher_id'] = teacher_id
    if assignment_id:
        message_body['assignment_id'] = assignment_id
    if student_id:
        message_body['student_id'] = student_id
    
    return message_body


def handler(event, context):
    """Process S3 ObjectCreated events and send messages to SQS"""
    logger.info("S3 upload trigger received", extra={
        "record_count": len(event.get('Records', [])),
        "request_id": context.aws_request_id if context else None,
    })
    
    processed_count = 0
    skipped_count = 0
    error_count = 0
    
    for record in event.get('Records', []):
        try:
            # Extract S3 event details
            bucket = record['s3']['bucket']['name']
            key = record['s3']['object']['key']
            
            # Parse S3 key
            teacher_id, assignment_id, file_name, file_type = parse_s3_key(key)
            
            # Skip unknown formats
            if file_type == 'unknown':
                logger.debug("Skipping unknown file format", extra={"key": key})
                skipped_count += 1
                continue
            
            # Handle zip files
            if file_type == 'zip':
                if not teacher_id or not assignment_id:
                    logger.warning("Zip file missing teacher_id or assignment_id", extra={"key": key})
                    skipped_count += 1
                    continue
                
                # Extract zip contents
                try:
                    extracted_files = extract_zip_contents(bucket, key)
                    
                    # Process each extracted file
                    for file_name_in_zip, essay_text in extracted_files:
                        message_body = process_single_essay(
                            bucket=bucket,
                            teacher_id=teacher_id,
                            assignment_id=assignment_id,
                            file_key=key,  # Original zip key for reference
                            essay_text=essay_text,
                        )
                        
                        if message_body:
                            # Send message to SQS
                            sqs.send_message(
                                QueueUrl=PROCESSING_QUEUE_URL,
                                MessageBody=json.dumps(message_body),
                            )
                            processed_count += 1
                            logger.info("Message sent to SQS", extra={
                                "essay_id": message_body.get('essay_id'),
                                "teacher_id": teacher_id,
                                "assignment_id": assignment_id,
                            })
                        else:
                            error_count += 1
                            
                except Exception as e:
                    logger.error("Failed to process zip file", extra={
                        "key": key,
                        "error": str(e),
                    }, exc_info=True)
                    error_count += 1
                    continue
            
            # Handle single essay files
            elif file_type == 'essay' or file_type == 'legacy':
                # For legacy essays, use the existing essay_id from the S3 key
                if file_type == 'legacy':
                    # Extract essay_id from key: essays/{essay_id}.txt
                    essay_id = file_name  # Already extracted in parse_s3_key
                    
                    # Create SQS message with existing essay_id
                    message_body = {
                        'essay_id': essay_id,
                        'file_key': key,
                        'bucket': bucket,
                    }
                    
                    # Send message to SQS
                    try:
                        sqs.send_message(
                            QueueUrl=PROCESSING_QUEUE_URL,
                            MessageBody=json.dumps(message_body),
                        )
                        processed_count += 1
                        logger.info("Message sent to SQS for legacy essay", extra={
                            "essay_id": essay_id,
                            "file_key": key,
                        })
                    except Exception as e:
                        logger.error("Failed to send message to SQS", extra={
                            "essay_id": essay_id,
                            "file_key": key,
                            "error": str(e),
                        }, exc_info=True)
                        error_count += 1
                else:
                    # For assignment essays, process normally
                    # Download essay text
                    try:
                        response = s3_client.get_object(Bucket=bucket, Key=key)
                        essay_text = response['Body'].read().decode('utf-8')
                    except Exception as e:
                        logger.error("Failed to download essay from S3", extra={
                            "key": key,
                            "error": str(e),
                        })
                        error_count += 1
                        continue
                    
                    # Process essay
                    message_body = process_single_essay(
                        bucket=bucket,
                        teacher_id=teacher_id,
                        assignment_id=assignment_id,
                        file_key=key,
                        essay_text=essay_text,
                    )
                    
                    if message_body:
                        # Send message to SQS
                        sqs.send_message(
                            QueueUrl=PROCESSING_QUEUE_URL,
                            MessageBody=json.dumps(message_body),
                        )
                        processed_count += 1
                        logger.info("Message sent to SQS", extra={
                            "essay_id": message_body.get('essay_id'),
                            "file_key": key,
                        })
                    else:
                        error_count += 1
            
            else:
                logger.debug("Skipping file", extra={"key": key, "file_type": file_type})
                skipped_count += 1
                continue
            
        except Exception as e:
            logger.error("Error processing S3 event", extra={
                "key": record.get('s3', {}).get('object', {}).get('key', 'unknown'),
                "error": str(e),
            }, exc_info=True)
            error_count += 1
            # Don't raise - allow other records to be processed
            continue
    
    logger.info("S3 upload trigger completed", extra={
        "processed": processed_count,
        "skipped": skipped_count,
        "errors": error_count,
    })
    
    return {
        'statusCode': 200,
        'body': json.dumps({
            'message': 'Processed S3 events',
            'processed': processed_count,
            'skipped': skipped_count,
            'errors': error_count,
        })
    }

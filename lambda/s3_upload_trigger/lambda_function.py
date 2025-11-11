import os
import json
import boto3
import logging

# Configure structured logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

sqs = boto3.client('sqs')

PROCESSING_QUEUE_URL = os.environ['PROCESSING_QUEUE_URL']


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
            
            # Only process files in the essays/ prefix
            if not key.startswith('essays/'):
                logger.debug("Skipping non-essay file", extra={"key": key})
                skipped_count += 1
                continue
            
            # Extract essay_id from key (essays/{essay_id}.txt)
            essay_id = key.replace('essays/', '').replace('.txt', '')
            
            # Create SQS message
            message_body = {
                'essay_id': essay_id,
                'file_key': key,
                'bucket': bucket,
            }
            
            # Send message to SQS
            sqs.send_message(
                QueueUrl=PROCESSING_QUEUE_URL,
                MessageBody=json.dumps(message_body),
            )
            
            logger.info("Message sent to SQS", extra={
                "essay_id": essay_id,
                "file_key": key,
                "bucket": bucket,
            })
            processed_count += 1
            
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


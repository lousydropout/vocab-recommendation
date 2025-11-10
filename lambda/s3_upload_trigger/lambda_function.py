import os
import json
import boto3

sqs = boto3.client('sqs')

PROCESSING_QUEUE_URL = os.environ['PROCESSING_QUEUE_URL']


def handler(event, context):
    """Process S3 ObjectCreated events and send messages to SQS"""
    for record in event.get('Records', []):
        try:
            # Extract S3 event details
            bucket = record['s3']['bucket']['name']
            key = record['s3']['object']['key']
            
            # Only process files in the essays/ prefix
            if not key.startswith('essays/'):
                print(f"Skipping non-essay file: {key}")
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
            
            print(f"Sent message to SQS for essay_id: {essay_id}")
            
        except Exception as e:
            print(f"Error processing S3 event: {str(e)}")
            # Don't raise - allow other records to be processed
            continue
    
    return {
        'statusCode': 200,
        'body': json.dumps({'message': 'Processed S3 events'})
    }


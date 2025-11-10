import os
import uuid
import boto3
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="Vocabulary Essay Analyzer API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')
sqs = boto3.client('sqs')

# Environment variables
METRICS_TABLE = os.environ['METRICS_TABLE']
ESSAYS_BUCKET = os.environ['ESSAYS_BUCKET']
PROCESSING_QUEUE_URL = os.environ['PROCESSING_QUEUE_URL']


class EssayUploadRequest(BaseModel):
    essay_text: Optional[str] = None
    request_presigned_url: Optional[bool] = False


class EssayResponse(BaseModel):
    essay_id: str
    status: str
    presigned_url: Optional[str] = None
    expires_in: Optional[int] = None


@app.post("/essay", response_model=EssayResponse)
async def create_essay(request: EssayUploadRequest):
    """Create essay record and optionally generate presigned URL for upload"""
    essay_id = str(uuid.uuid4())
    file_key = f"essays/{essay_id}.txt"
    
    table = dynamodb.Table(METRICS_TABLE)
    now = datetime.utcnow().isoformat()
    
    # Create DynamoDB record
    table.put_item(
        Item={
            'essay_id': essay_id,
            'status': 'awaiting_processing',
            'file_key': file_key,
            'created_at': now,
            'updated_at': now,
        }
    )
    
    # If essay_text provided, upload directly to S3
    if request.essay_text:
        try:
            s3_client.put_object(
                Bucket=ESSAYS_BUCKET,
                Key=file_key,
                Body=request.essay_text.encode('utf-8'),
                ContentType='text/plain',
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to upload essay: {str(e)}")
    
    # If presigned URL requested, generate it
    presigned_url = None
    expires_in = None
    if request.request_presigned_url or not request.essay_text:
        presigned_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': ESSAYS_BUCKET,
                'Key': file_key,
                'ContentType': 'text/plain',
            },
            ExpiresIn=3600
        )
        expires_in = 3600
    
    return EssayResponse(
        essay_id=essay_id,
        status='awaiting_processing',
        presigned_url=presigned_url,
        expires_in=expires_in,
    )


@app.get("/essay/{essay_id}")
async def get_essay(essay_id: str):
    """Retrieve essay analysis results"""
    table = dynamodb.Table(METRICS_TABLE)
    
    try:
        response = table.get_item(Key={'essay_id': essay_id})
        if 'Item' not in response:
            raise HTTPException(status_code=404, detail="Essay not found")
        
        item = response['Item']
        return {
            'essay_id': item['essay_id'],
            'status': item.get('status', 'unknown'),
            'file_key': item.get('file_key'),
            'metrics': item.get('metrics'),
            'feedback': item.get('feedback', []),
            'created_at': item.get('created_at'),
            'updated_at': item.get('updated_at'),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve essay: {str(e)}")


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "healthy"}


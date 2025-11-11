import os
import uuid
import boto3
import logging
from datetime import datetime
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from app.deps import get_teacher_context, TeacherContext
from app.db.teachers import get_or_create_teacher
from app.routes import students, assignments

# Configure structured logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

app = FastAPI(title="Vocabulary Essay Analyzer API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(students.router)
app.include_router(assignments.router)

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
async def create_essay(
    request: EssayUploadRequest,
    teacher_ctx: TeacherContext = Depends(get_teacher_context)
):
    """Create essay record and optionally generate presigned URL for upload"""
    essay_id = str(uuid.uuid4())
    file_key = f"essays/{essay_id}.txt"
    
    # Log upload received
    logger.info("Essay upload received", extra={
        "essay_id": essay_id,
        "teacher_id": teacher_ctx.teacher_id,
        "has_text": bool(request.essay_text),
        "request_presigned_url": request.request_presigned_url,
        "text_length": len(request.essay_text) if request.essay_text else 0,
    })
    
    table = dynamodb.Table(METRICS_TABLE)
    now = datetime.utcnow().isoformat()
    
    # Create DynamoDB record
    try:
        table.put_item(
            Item={
                'essay_id': essay_id,
                'status': 'awaiting_processing',
                'file_key': file_key,
                'created_at': now,
                'updated_at': now,
            }
        )
        logger.info("DynamoDB record created", extra={"essay_id": essay_id})
    except Exception as e:
        logger.error("Failed to create DynamoDB record", extra={
            "essay_id": essay_id,
            "error": str(e),
        }, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create essay record: {str(e)}")
    
    # If essay_text provided, upload directly to S3
    if request.essay_text:
        try:
            s3_client.put_object(
                Bucket=ESSAYS_BUCKET,
                Key=file_key,
                Body=request.essay_text.encode('utf-8'),
                ContentType='text/plain',
            )
            logger.info("Essay uploaded to S3", extra={"essay_id": essay_id, "file_key": file_key})
        except Exception as e:
            logger.error("Failed to upload essay to S3", extra={
                "essay_id": essay_id,
                "file_key": file_key,
                "error": str(e),
            }, exc_info=True)
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
        logger.info("Presigned URL generated", extra={"essay_id": essay_id, "expires_in": expires_in})
    
    logger.info("Essay upload completed", extra={"essay_id": essay_id, "status": "awaiting_processing"})
    
    return EssayResponse(
        essay_id=essay_id,
        status='awaiting_processing',
        presigned_url=presigned_url,
        expires_in=expires_in,
    )


@app.get("/essay/{essay_id}")
async def get_essay(
    essay_id: str,
    teacher_ctx: TeacherContext = Depends(get_teacher_context)
):
    """Retrieve essay analysis results"""
    logger.info("Essay retrieval requested", extra={
        "essay_id": essay_id,
        "teacher_id": teacher_ctx.teacher_id,
    })
    
    table = dynamodb.Table(METRICS_TABLE)
    
    try:
        response = table.get_item(Key={'essay_id': essay_id})
        if 'Item' not in response:
            logger.warning("Essay not found", extra={"essay_id": essay_id})
            raise HTTPException(status_code=404, detail="Essay not found")
        
        item = response['Item']
        status = item.get('status', 'unknown')
        logger.info("Essay retrieved", extra={
            "essay_id": essay_id,
            "status": status,
            "has_metrics": bool(item.get('metrics')),
            "feedback_count": len(item.get('feedback', [])),
        })
        
        return {
            'essay_id': item['essay_id'],
            'status': status,
            'file_key': item.get('file_key'),
            'metrics': item.get('metrics'),
            'feedback': item.get('feedback', []),
            'created_at': item.get('created_at'),
            'updated_at': item.get('updated_at'),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to retrieve essay", extra={
            "essay_id": essay_id,
            "error": str(e),
        }, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve essay: {str(e)}")


@app.get("/health")
async def health():
    """Health check endpoint (public, no auth required)"""
    return {"status": "healthy"}


@app.get("/auth/health")
async def auth_health(teacher_ctx: TeacherContext = Depends(get_teacher_context)):
    """
    Auth health check endpoint.
    Validates token and returns teacher information.
    Ensures teacher record exists in DynamoDB (creates if missing).
    """
    try:
        # Get or create teacher record
        teacher = get_or_create_teacher(
            teacher_id=teacher_ctx.teacher_id,
            email=teacher_ctx.email,
        )
        
        logger.info("Auth health check successful", extra={
            "teacher_id": teacher_ctx.teacher_id,
            "email": teacher_ctx.email,
        })
        
        return {
            "status": "authenticated",
            "teacher_id": teacher_ctx.teacher_id,
            "email": teacher.get('email') or teacher_ctx.email,
            "name": teacher.get('name', ''),
        }
    except Exception as e:
        logger.error("Failed to get or create teacher in auth health", extra={
            "teacher_id": teacher_ctx.teacher_id,
            "error": str(e),
        }, exc_info=True)
        # Still return auth success even if DB operation fails
        return {
            "status": "authenticated",
            "teacher_id": teacher_ctx.teacher_id,
            "email": teacher_ctx.email,
        }


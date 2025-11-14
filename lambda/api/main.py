import os
import uuid
import boto3
import logging
import json
from datetime import datetime
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

# Optional OpenAI import (only if package is installed)
try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    OpenAI = None

from app.deps import get_teacher_context, get_optional_teacher_context, TeacherContext
from app.db.teachers import get_or_create_teacher
from app.routes import students, assignments, metrics, essays

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
app.include_router(metrics.router)
app.include_router(essays.router)

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')
sqs = boto3.client('sqs')

# Environment variables
METRICS_TABLE = os.environ['METRICS_TABLE']
ESSAYS_BUCKET = os.environ['ESSAYS_BUCKET']
PROCESSING_QUEUE_URL = os.environ['PROCESSING_QUEUE_URL']
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY')

# Initialize OpenAI client if API key is available and package is installed
openai_client = None
if OPENAI_AVAILABLE and OPENAI_API_KEY:
    try:
        openai_client = OpenAI(api_key=OPENAI_API_KEY)
        logger.info("OpenAI client initialized successfully", extra={"has_key": bool(OPENAI_API_KEY), "key_length": len(OPENAI_API_KEY) if OPENAI_API_KEY else 0})
    except Exception as e:
        logger.warning("Failed to initialize OpenAI client", extra={"error": str(e)})
        openai_client = None
elif not OPENAI_AVAILABLE:
    logger.warning("OpenAI package not available - vocabulary analysis will be disabled")
elif not OPENAI_API_KEY:
    logger.info("OPENAI_API_KEY not set - vocabulary analysis will be disabled")


class EssayUploadRequest(BaseModel):
    essay_text: Optional[str] = None
    request_presigned_url: Optional[bool] = False


class VocabularyAnalysis(BaseModel):
    """Vocabulary analysis from OpenAI"""
    correctness_review: str
    vocabulary_used: List[str]
    recommended_vocabulary: List[str]


class EssayResponse(BaseModel):
    essay_id: str
    status: str
    presigned_url: Optional[str] = None
    expires_in: Optional[int] = None
    vocabulary_analysis: Optional[VocabularyAnalysis] = None


def analyze_essay_with_openai(essay_text: str) -> VocabularyAnalysis:
    """
    Analyze essay using OpenAI GPT-4o-mini and return vocabulary analysis.
    Note: OpenAI client is synchronous, so this function is not async.
    """
    if not openai_client:
        raise ValueError("OpenAI client not initialized")
    
    prompt = f"""Analyze the following student essay and provide vocabulary feedback in JSON format.

Essay:
{essay_text}

Please provide a JSON response with the following structure:
{{
  "correctness_review": "A high-level review (2-3 sentences) of whether words and phrases were used correctly in context.",
  "vocabulary_used": ["list", "of", "vocabulary", "words", "and", "phrases", "that", "indicate", "the", "writer's", "current", "level"],
  "recommended_vocabulary": ["list", "of", "new", "vocabulary", "words", "that", "match", "or", "slightly", "exceed", "the", "writer's", "level"]
}}

Focus on:
- Vocabulary words/phrases that demonstrate the student's current level (include 5-10 examples)
- Recommended vocabulary that would help the student grow (5-10 words that are slightly more advanced but appropriate)
- Be specific and educational in your recommendations

Return ONLY valid JSON, no additional text."""

    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are an expert English teacher analyzing student essays for vocabulary development. Always respond with valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        logger.info("OpenAI response received", extra={"response_length": len(content)})
        
        # Parse JSON response
        analysis_data = json.loads(content)
        
        # Validate and create VocabularyAnalysis object
        return VocabularyAnalysis(
            correctness_review=analysis_data.get("correctness_review", ""),
            vocabulary_used=analysis_data.get("vocabulary_used", []),
            recommended_vocabulary=analysis_data.get("recommended_vocabulary", [])
        )
    except json.JSONDecodeError as e:
        content_preview = content[:200] if 'content' in locals() else "N/A"
        logger.error("Failed to parse OpenAI JSON response", extra={"error": str(e), "content": content_preview})
        raise ValueError(f"Invalid JSON response from OpenAI: {str(e)}")
    except Exception as e:
        logger.error("OpenAI API call failed", extra={"error": str(e)}, exc_info=True)
        raise


@app.post("/essay", response_model=EssayResponse)
async def create_essay(
    request: EssayUploadRequest,
    teacher_ctx: Optional[TeacherContext] = Depends(get_optional_teacher_context)
):
    """Create essay record and optionally generate presigned URL for upload (public endpoint)"""
    essay_id = str(uuid.uuid4())
    file_key = f"essays/{essay_id}.txt"
    
    # Determine teacher_id: use from context if authenticated, otherwise "LEGACY"
    teacher_id = teacher_ctx.teacher_id if teacher_ctx else "LEGACY"
    
    # Log upload received
    logger.info("Essay upload received", extra={
        "essay_id": essay_id,
        "teacher_id": teacher_id,
        "is_legacy": teacher_ctx is None,
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
                'teacher_id': teacher_id,
                'created_at': now,
                'updated_at': now,
            }
        )
        logger.info("DynamoDB record created", extra={"essay_id": essay_id, "teacher_id": teacher_id})
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
    
    # For legacy essays (public, no auth), call OpenAI directly
    vocabulary_analysis = None
    if teacher_id == "LEGACY" and request.essay_text and openai_client:
        try:
            logger.info("Calling OpenAI for legacy essay analysis", extra={"essay_id": essay_id})
            vocabulary_analysis = analyze_essay_with_openai(request.essay_text)
            
            # Update DynamoDB with analysis results
            try:
                table.update_item(
                    Key={'essay_id': essay_id},
                    UpdateExpression='SET #status = :status, vocabulary_analysis = :analysis, updated_at = :updated_at',
                    ExpressionAttributeNames={
                        '#status': 'status'
                    },
                    ExpressionAttributeValues={
                        ':status': 'processed',
                        ':analysis': vocabulary_analysis.dict(),
                        ':updated_at': datetime.utcnow().isoformat()
                    }
                )
                logger.info("DynamoDB updated with OpenAI analysis", extra={"essay_id": essay_id})
            except Exception as e:
                logger.error("Failed to update DynamoDB with analysis", extra={
                    "essay_id": essay_id,
                    "error": str(e),
                }, exc_info=True)
        except Exception as e:
            logger.error("Failed to analyze essay with OpenAI", extra={
                "essay_id": essay_id,
                "error": str(e),
            }, exc_info=True)
            # Continue without analysis - don't fail the request
    
    logger.info("Essay upload completed", extra={"essay_id": essay_id, "status": "awaiting_processing"})
    
    return EssayResponse(
        essay_id=essay_id,
        status='processed' if vocabulary_analysis else 'awaiting_processing',
        presigned_url=presigned_url,
        expires_in=expires_in,
        vocabulary_analysis=vocabulary_analysis,
    )


@app.get("/essay/{essay_id}")
async def get_essay(
    essay_id: str,
    teacher_ctx: Optional[TeacherContext] = Depends(get_optional_teacher_context)
):
    """Retrieve essay analysis results (public endpoint)"""
    teacher_id = teacher_ctx.teacher_id if teacher_ctx else None
    logger.info("Essay retrieval requested", extra={
        "essay_id": essay_id,
        "teacher_id": teacher_id,
        "is_legacy": teacher_ctx is None,
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
        
        result = {
            'essay_id': item['essay_id'],
            'status': status,
            'file_key': item.get('file_key'),
            'metrics': item.get('metrics'),
            'feedback': item.get('feedback', []),
            'created_at': item.get('created_at'),
            'updated_at': item.get('updated_at'),
        }
        
        # Include vocabulary_analysis if present (for legacy essays)
        if 'vocabulary_analysis' in item:
            result['vocabulary_analysis'] = item['vocabulary_analysis']
        
        return result
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


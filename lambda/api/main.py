import os
import uuid
import boto3
import logging
import json
import traceback
from datetime import datetime
from fastapi import FastAPI, HTTPException, Depends, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from app.deps import get_teacher_context, get_optional_teacher_context, TeacherContext
from app.db.teachers import get_or_create_teacher
from app.routes import students, assignments, metrics, essays

# Configure structured logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

app = FastAPI(title="Vocabulary Essay Analyzer API")

# Add CORS middleware
# Allow both production domain and localhost for development
allowed_origins = [
    "https://vocab.vincentchan.cloud",
    "http://localhost:3000",
    "http://localhost:5173",  # Vite default port
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Add exception handlers to ensure CORS headers are always included
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler that ensures CORS headers are always included."""
    logger.error("Unhandled exception", extra={
        "path": request.url.path,
        "method": request.method,
        "error": str(exc),
        "traceback": traceback.format_exc(),
    }, exc_info=True)
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": f"Internal server error: {str(exc)}"},
        headers={
            "Access-Control-Allow-Origin": request.headers.get("origin") if request.headers.get("origin") in allowed_origins else allowed_origins[0],
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        }
    )

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """HTTP exception handler that ensures CORS headers are included."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers={
            "Access-Control-Allow-Origin": request.headers.get("origin") if request.headers.get("origin") in allowed_origins else allowed_origins[0],
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        }
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Validation exception handler that ensures CORS headers are included."""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": exc.errors()},
        headers={
            "Access-Control-Allow-Origin": request.headers.get("origin") if request.headers.get("origin") in allowed_origins else allowed_origins[0],
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        }
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
ESSAYS_BUCKET = os.environ.get('ESSAYS_BUCKET')  # Optional - used for presigned URLs
# Legacy METRICS_TABLE and PROCESSING_QUEUE_URL removed - use Essays table and ESSAY_PROCESSING_QUEUE_URL instead


class EssayUploadRequest(BaseModel):
    essay_text: Optional[str] = None
    request_presigned_url: Optional[bool] = False


# Legacy /essay endpoints removed - use /essays/batch and /essays/{essay_id} instead
# All processing is now async via SQS Worker Lambda


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


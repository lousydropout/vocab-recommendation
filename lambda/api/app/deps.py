"""
FastAPI dependencies for authentication and authorization.
"""
import logging
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.auth import verify_token, extract_teacher_id, extract_email

logger = logging.getLogger()

# HTTP Bearer token security scheme
security = HTTPBearer()


class TeacherContext:
    """Context object containing teacher information from JWT token."""
    
    def __init__(self, teacher_id: str, email: Optional[str] = None):
        self.teacher_id = teacher_id
        self.email = email


async def get_teacher_context(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> TeacherContext:
    """
    FastAPI dependency that extracts and validates JWT token,
    then returns a TeacherContext with teacher_id.
    
    This dependency should be used on all protected routes.
    """
    token = credentials.credentials
    
    # Verify the token
    claims = verify_token(token)
    if not claims:
        logger.warning("Token verification failed", extra={"token_prefix": token[:20]})
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Extract teacher_id from token
    teacher_id = extract_teacher_id(claims)
    if not teacher_id:
        logger.error("Token missing teacher_id (sub claim)")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing required claims",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Extract email for convenience
    email = extract_email(claims)
    
    logger.info("Teacher context created", extra={
        "teacher_id": teacher_id,
        "email": email,
    })
    
    return TeacherContext(teacher_id=teacher_id, email=email)


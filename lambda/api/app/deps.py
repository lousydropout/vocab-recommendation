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
# Optional security scheme (doesn't raise error if missing)
optional_security = HTTPBearer(auto_error=False)


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


async def get_optional_teacher_context(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security)
) -> Optional[TeacherContext]:
    """
    FastAPI dependency that optionally extracts and validates JWT token.
    Returns TeacherContext if token is provided and valid, None otherwise.
    
    This dependency should be used on public routes that optionally support authentication.
    """
    if not credentials:
        logger.debug("No credentials provided, returning None")
        return None
    
    token = credentials.credentials
    
    # Verify the token
    claims = verify_token(token)
    if not claims:
        logger.warning("Optional token verification failed", extra={"token_prefix": token[:20]})
        return None
    
    # Extract teacher_id from token
    teacher_id = extract_teacher_id(claims)
    if not teacher_id:
        logger.warning("Optional token missing teacher_id (sub claim)")
        return None
    
    # Extract email for convenience
    email = extract_email(claims)
    
    logger.info("Optional teacher context created", extra={
        "teacher_id": teacher_id,
        "email": email,
    })
    
    return TeacherContext(teacher_id=teacher_id, email=email)


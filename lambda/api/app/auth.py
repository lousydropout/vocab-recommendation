"""
JWT verification utilities for Cognito tokens.
"""
import os
import json
import logging
from typing import Dict, Optional
from jose import jwt, jwk, JWTError
from jose.utils import base64url_decode
import requests

logger = logging.getLogger()

# Cognito configuration from environment
COGNITO_USER_POOL_ID = os.environ.get('COGNITO_USER_POOL_ID')
COGNITO_REGION = os.environ.get('COGNITO_REGION', 'us-east-1')
COGNITO_CLIENT_ID = os.environ.get('COGNITO_USER_POOL_CLIENT_ID')  # For audience validation
COGNITO_ISSUER = f'https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}'

# Cache for JWKs (JSON Web Key Set)
_jwks_cache: Optional[Dict] = None


def get_jwks() -> Dict:
    """
    Fetch and cache the JWKS (JSON Web Key Set) from Cognito.
    The JWKS contains public keys used to verify JWT tokens.
    """
    global _jwks_cache
    
    if _jwks_cache is None:
        jwks_url = f'{COGNITO_ISSUER}/.well-known/jwks.json'
        try:
            response = requests.get(jwks_url, timeout=5)
            response.raise_for_status()
            _jwks_cache = response.json()
            logger.info("JWKS fetched from Cognito", extra={"jwks_url": jwks_url})
        except Exception as e:
            logger.error("Failed to fetch JWKS", extra={"jwks_url": jwks_url, "error": str(e)})
            raise
    
    return _jwks_cache


def get_signing_key(token: str) -> Optional[jwk.Key]:
    """
    Get the signing key for a JWT token from the JWKS.
    """
    try:
        # Decode the token header to get the key ID (kid)
        headers = jwt.get_unverified_header(token)
        kid = headers.get('kid')
        
        if not kid:
            logger.warning("Token missing kid in header")
            return None
        
        # Get JWKS and find the matching key
        jwks = get_jwks()
        for key in jwks.get('keys', []):
            if key.get('kid') == kid:
                return jwk.construct(key)
        
        logger.warning("No matching key found in JWKS", extra={"kid": kid})
        return None
    except Exception as e:
        logger.error("Failed to get signing key", extra={"error": str(e)})
        return None


def verify_token(token: str) -> Optional[Dict]:
    """
    Verify and decode a Cognito JWT token.
    
    Returns:
        Decoded token payload if valid, None otherwise
    """
    try:
        # Get the signing key
        key = get_signing_key(token)
        if not key:
            return None
        
        # Verify and decode the token
        # Cognito IdTokens have audience set to the Client ID
        decode_options = {
            "verify_signature": True,
            "verify_iss": True,
            "verify_exp": True,
        }
        
        # If client ID is available, verify audience; otherwise skip audience check
        if COGNITO_CLIENT_ID:
            decode_options["verify_aud"] = True
            audience = COGNITO_CLIENT_ID
        else:
            decode_options["verify_aud"] = False
            audience = None
        
        claims = jwt.decode(
            token,
            key,
            algorithms=['RS256'],
            audience=audience,
            issuer=COGNITO_ISSUER,
            options=decode_options
        )
        
        logger.info("Token verified successfully", extra={"sub": claims.get('sub')})
        return claims
        
    except JWTError as e:
        logger.warning("JWT verification failed", extra={"error": str(e)})
        return None
    except Exception as e:
        logger.error("Unexpected error during token verification", extra={"error": str(e)})
        return None


def extract_teacher_id(claims: Dict) -> Optional[str]:
    """
    Extract teacher_id from Cognito token claims.
    Uses 'sub' (subject) as teacher_id per implementation notes.
    """
    teacher_id = claims.get('sub')
    if not teacher_id:
        logger.warning("Token missing sub claim")
    return teacher_id


def extract_email(claims: Dict) -> Optional[str]:
    """
    Extract email from Cognito token claims.
    """
    return claims.get('email')


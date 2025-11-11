"""
Unit tests for JWT validation and teacher context injection.
"""
import pytest
import os
from unittest.mock import Mock, patch, MagicMock
from jose import jwt, JWTError
from fastapi import HTTPException

from app.auth import (
    get_jwks,
    get_signing_key,
    verify_token,
    extract_teacher_id,
    extract_email,
)
from app.deps import get_teacher_context, TeacherContext
from fastapi.security import HTTPAuthorizationCredentials


# Mock environment variables
@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    """Set up environment variables for tests."""
    monkeypatch.setenv('COGNITO_USER_POOL_ID', 'us-east-1_test123')
    monkeypatch.setenv('COGNITO_REGION', 'us-east-1')


@pytest.fixture
def mock_jwks():
    """Mock JWKS response from Cognito."""
    return {
        'keys': [
            {
                'kid': 'test-key-id',
                'kty': 'RSA',
                'use': 'sig',
                'n': 'test-n',
                'e': 'AQAB',
            }
        ]
    }


@pytest.fixture
def mock_jwks_data():
    """Alias for mock_jwks for use in tests."""
    return {
        'keys': [
            {
                'kid': 'test-key-id',
                'kty': 'RSA',
                'use': 'sig',
                'n': 'test-n',
                'e': 'AQAB',
            }
        ]
    }


@pytest.fixture
def mock_token_claims():
    """Mock JWT token claims."""
    return {
        'sub': 'teacher-123',
        'email': 'teacher@example.com',
        'iss': 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test123',
        'exp': 9999999999,  # Far future
        'iat': 1000000000,
    }


class TestJWKS:
    """Tests for JWKS fetching."""
    
    def setup_method(self):
        """Clear JWKS cache before each test."""
        import app.auth
        app.auth._jwks_cache = None
    
    @patch('app.auth.requests.get')
    def test_get_jwks_success(self, mock_get, mock_jwks):
        """Test successful JWKS fetch."""
        mock_response = Mock()
        mock_response.json.return_value = mock_jwks
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response
        
        result = get_jwks()
        
        assert result == mock_jwks
        mock_get.assert_called_once()
    
    @patch('app.auth.requests.get')
    def test_get_jwks_caching(self, mock_get, mock_jwks):
        """Test that JWKS is cached after first fetch."""
        mock_response = Mock()
        mock_response.json.return_value = mock_jwks
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response
        
        # First call
        result1 = get_jwks()
        # Second call should use cache
        result2 = get_jwks()
        
        assert result1 == result2 == mock_jwks
        # Should only be called once due to caching
        assert mock_get.call_count == 1
    
    @patch('app.auth.requests.get')
    def test_get_jwks_failure(self, mock_get):
        """Test JWKS fetch failure."""
        mock_get.side_effect = Exception("Network error")
        
        with pytest.raises(Exception):
            get_jwks()


class TestSigningKey:
    """Tests for signing key extraction."""
    
    @patch('app.auth.get_jwks')
    @patch('app.auth.jwt.get_unverified_header')
    def test_get_signing_key_success(self, mock_header, mock_jwks, mock_jwks_data):
        """Test successful signing key extraction."""
        mock_header.return_value = {'kid': 'test-key-id', 'alg': 'RS256'}
        mock_jwks.return_value = mock_jwks_data
        
        # Mock jwk.construct
        with patch('app.auth.jwk.construct') as mock_construct:
            mock_key = Mock()
            mock_construct.return_value = mock_key
            
            result = get_signing_key('test-token')
            
            assert result == mock_key
            mock_construct.assert_called_once()
    
    @patch('app.auth.get_jwks')
    @patch('app.auth.jwt.get_unverified_header')
    def test_get_signing_key_no_kid(self, mock_header, mock_jwks):
        """Test signing key extraction when token has no kid."""
        mock_header.return_value = {'alg': 'RS256'}  # No kid
        mock_jwks.return_value = {'keys': []}
        
        result = get_signing_key('test-token')
        
        assert result is None
    
    @patch('app.auth.get_jwks')
    @patch('app.auth.jwt.get_unverified_header')
    def test_get_signing_key_no_match(self, mock_header, mock_jwks):
        """Test signing key extraction when no matching key found."""
        mock_header.return_value = {'kid': 'unknown-key-id', 'alg': 'RS256'}
        mock_jwks.return_value = {'keys': []}
        
        result = get_signing_key('test-token')
        
        assert result is None


class TestTokenVerification:
    """Tests for token verification."""
    
    @patch('app.auth.get_signing_key')
    @patch('app.auth.jwt.decode')
    def test_verify_token_success(self, mock_decode, mock_get_key, mock_token_claims):
        """Test successful token verification."""
        mock_key = Mock()
        mock_get_key.return_value = mock_key
        mock_decode.return_value = mock_token_claims
        
        result = verify_token('valid-token')
        
        assert result == mock_token_claims
        mock_decode.assert_called_once()
        assert mock_decode.call_args[1]['algorithms'] == ['RS256']
    
    @patch('app.auth.get_signing_key')
    def test_verify_token_no_key(self, mock_get_key):
        """Test token verification when no signing key found."""
        mock_get_key.return_value = None
        
        result = verify_token('invalid-token')
        
        assert result is None
    
    @patch('app.auth.get_signing_key')
    @patch('app.auth.jwt.decode')
    def test_verify_token_jwt_error(self, mock_decode, mock_get_key):
        """Test token verification with JWT error."""
        mock_key = Mock()
        mock_get_key.return_value = mock_key
        mock_decode.side_effect = JWTError("Invalid token")
        
        result = verify_token('invalid-token')
        
        assert result is None


class TestClaimExtraction:
    """Tests for extracting claims from tokens."""
    
    def test_extract_teacher_id_success(self):
        """Test successful teacher_id extraction."""
        claims = {'sub': 'teacher-123', 'email': 'teacher@example.com'}
        
        result = extract_teacher_id(claims)
        
        assert result == 'teacher-123'
    
    def test_extract_teacher_id_missing(self):
        """Test teacher_id extraction when sub is missing."""
        claims = {'email': 'teacher@example.com'}
        
        result = extract_teacher_id(claims)
        
        assert result is None
    
    def test_extract_email_success(self):
        """Test successful email extraction."""
        claims = {'sub': 'teacher-123', 'email': 'teacher@example.com'}
        
        result = extract_email(claims)
        
        assert result == 'teacher@example.com'
    
    def test_extract_email_missing(self):
        """Test email extraction when email is missing."""
        claims = {'sub': 'teacher-123'}
        
        result = extract_email(claims)
        
        assert result is None


class TestTeacherContext:
    """Tests for TeacherContext class."""
    
    def test_teacher_context_creation(self):
        """Test creating a TeacherContext."""
        ctx = TeacherContext(teacher_id='teacher-123', email='teacher@example.com')
        
        assert ctx.teacher_id == 'teacher-123'
        assert ctx.email == 'teacher@example.com'
    
    def test_teacher_context_no_email(self):
        """Test creating a TeacherContext without email."""
        ctx = TeacherContext(teacher_id='teacher-123')
        
        assert ctx.teacher_id == 'teacher-123'
        assert ctx.email is None


class TestGetTeacherContext:
    """Tests for get_teacher_context dependency."""
    
    @pytest.mark.asyncio
    @patch('app.deps.verify_token')
    async def test_get_teacher_context_success(self, mock_verify, mock_token_claims):
        """Test successful teacher context creation."""
        mock_verify.return_value = mock_token_claims
        credentials = HTTPAuthorizationCredentials(
            scheme='Bearer',
            credentials='valid-token'
        )
        
        result = await get_teacher_context(credentials)
        
        assert isinstance(result, TeacherContext)
        assert result.teacher_id == 'teacher-123'
        assert result.email == 'teacher@example.com'
        mock_verify.assert_called_once_with('valid-token')
    
    @pytest.mark.asyncio
    @patch('app.deps.verify_token')
    async def test_get_teacher_context_invalid_token(self, mock_verify):
        """Test teacher context creation with invalid token."""
        mock_verify.return_value = None
        credentials = HTTPAuthorizationCredentials(
            scheme='Bearer',
            credentials='invalid-token'
        )
        
        with pytest.raises(HTTPException) as exc_info:
            await get_teacher_context(credentials)
        
        assert exc_info.value.status_code == 401
        assert 'Invalid or expired token' in str(exc_info.value.detail)
    
    @pytest.mark.asyncio
    @patch('app.deps.verify_token')
    @patch('app.deps.extract_teacher_id')
    async def test_get_teacher_context_missing_sub(self, mock_extract, mock_verify):
        """Test teacher context creation when token missing sub claim."""
        mock_verify.return_value = {'email': 'teacher@example.com'}  # No sub
        mock_extract.return_value = None
        credentials = HTTPAuthorizationCredentials(
            scheme='Bearer',
            credentials='token-without-sub'
        )
        
        with pytest.raises(HTTPException) as exc_info:
            await get_teacher_context(credentials)
        
        assert exc_info.value.status_code == 401
        assert 'Token missing required claims' in str(exc_info.value.detail)


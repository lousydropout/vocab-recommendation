"""
Unit tests for essay override API endpoint (Epic 8).
"""
import pytest
import os
import json
from unittest.mock import Mock, patch, MagicMock
from fastapi.testclient import TestClient

# Set environment variables before importing modules
os.environ['METRICS_TABLE'] = 'test-metrics-table'
os.environ['CLASS_METRICS_TABLE'] = 'test-class-metrics-table'
os.environ['STUDENT_METRICS_TABLE'] = 'test-student-metrics-table'
os.environ['ESSAYS_BUCKET'] = 'test-bucket'
os.environ['PROCESSING_QUEUE_URL'] = 'https://test-queue'
os.environ['ESSAY_UPDATE_QUEUE_URL'] = 'https://test-update-queue'
os.environ['COGNITO_USER_POOL_ID'] = 'test-pool-id'
os.environ['COGNITO_USER_POOL_CLIENT_ID'] = 'test-client-id'
os.environ['COGNITO_REGION'] = 'us-east-1'

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from main import app
from app.deps import TeacherContext

# Mock teacher context
mock_teacher_context = TeacherContext(
    teacher_id='test-teacher-123',
    email='test@example.com'
)


@pytest.fixture
def client():
    """Create test client with mocked auth."""
    from app.deps import get_teacher_context
    
    # Override the dependency
    app.dependency_overrides[get_teacher_context] = lambda: mock_teacher_context
    
    yield TestClient(app)
    
    # Clean up
    app.dependency_overrides.clear()


class TestEssayOverride:
    """Tests for PATCH /essays/{essay_id}/override endpoint."""
    
    def test_override_essay_feedback_success(self, client):
        """Test successful override of essay feedback."""
        essay_id = 'essay-123'
        feedback_data = [
            {'word': 'articulated', 'correct': False, 'comment': 'Too formal'},
            {'word': 'rapidly', 'correct': True, 'comment': 'Good usage'},
        ]
        
        with patch('app.routes.essays.metrics_table') as mock_table, \
             patch('app.routes.essays.sqs') as mock_sqs, \
             patch('app.routes.essays.ESSAY_UPDATE_QUEUE_URL', 'https://queue-url'):
            
            # Mock existing essay
            mock_table.get_item.return_value = {
                'Item': {
                    'essay_id': essay_id,
                    'teacher_id': 'test-teacher-123',
                    'assignment_id': 'assignment-456',
                    'student_id': 'student-789',
                    'status': 'processed',
                }
            }
            
            # Mock update_item
            mock_table.update_item.return_value = {}
            
            # Mock SQS send_message
            mock_sqs.send_message.return_value = {'MessageId': 'msg-123'}
            
            response = client.patch(
                f'/essays/{essay_id}/override',
                json={'feedback': feedback_data}
            )
            
            assert response.status_code == 200
            data = response.json()
            assert data['essay_id'] == essay_id
            assert 'successful' in data['message'].lower()
            
            # Verify update_item was called
            mock_table.update_item.assert_called_once()
            call_args = mock_table.update_item.call_args
            assert call_args[1]['Key']['essay_id'] == essay_id
            assert '#feedback' in call_args[1]['UpdateExpression']
            
            # Verify SQS message was sent
            mock_sqs.send_message.assert_called_once()
            sqs_call_args = mock_sqs.send_message.call_args
            message_body = json.loads(sqs_call_args[1]['MessageBody'])
            assert message_body['teacher_id'] == 'test-teacher-123'
            assert message_body['assignment_id'] == 'assignment-456'
            assert message_body['student_id'] == 'student-789'
            assert message_body['essay_id'] == essay_id
            assert message_body['override'] is True
    
    def test_override_essay_not_found(self, client):
        """Test error when essay not found."""
        essay_id = 'essay-999'
        
        with patch('app.routes.essays.metrics_table') as mock_table:
            mock_table.get_item.return_value = {}
            
            response = client.patch(
                f'/essays/{essay_id}/override',
                json={'feedback': [{'word': 'test', 'correct': True, 'comment': ''}]}
            )
            
            assert response.status_code == 404
            assert 'not found' in response.json()['detail'].lower()
    
    def test_override_essay_unauthorized(self, client):
        """Test error when teacher doesn't own the essay."""
        essay_id = 'essay-123'
        
        with patch('app.routes.essays.metrics_table') as mock_table:
            mock_table.get_item.return_value = {
                'Item': {
                    'essay_id': essay_id,
                    'teacher_id': 'different-teacher-456',  # Different teacher
                    'status': 'processed',
                }
            }
            
            response = client.patch(
                f'/essays/{essay_id}/override',
                json={'feedback': [{'word': 'test', 'correct': True, 'comment': ''}]}
            )
            
            assert response.status_code == 403
            assert 'not authorized' in response.json()['detail'].lower()
    
    def test_override_essay_table_not_configured(self, client):
        """Test error when table is not configured."""
        with patch('app.routes.essays.metrics_table', None):
            response = client.patch(
                '/essays/essay-123/override',
                json={'feedback': [{'word': 'test', 'correct': True, 'comment': ''}]}
            )
            
            assert response.status_code == 500
            assert 'not configured' in response.json()['detail'].lower()
    
    def test_override_essay_dynamodb_error(self, client):
        """Test error handling for DynamoDB failures."""
        essay_id = 'essay-123'
        
        with patch('app.routes.essays.metrics_table') as mock_table:
            mock_table.get_item.side_effect = Exception("DynamoDB error")
            
            response = client.patch(
                f'/essays/{essay_id}/override',
                json={'feedback': [{'word': 'test', 'correct': True, 'comment': ''}]}
            )
            
            assert response.status_code == 500
            assert 'Failed to override' in response.json()['detail']
    
    def test_override_essay_sqs_failure_doesnt_fail_request(self, client):
        """Test that SQS failure doesn't fail the override request."""
        essay_id = 'essay-123'
        
        with patch('app.routes.essays.metrics_table') as mock_table, \
             patch('app.routes.essays.sqs') as mock_sqs, \
             patch('app.routes.essays.ESSAY_UPDATE_QUEUE_URL', 'https://queue-url'):
            
            mock_table.get_item.return_value = {
                'Item': {
                    'essay_id': essay_id,
                    'teacher_id': 'test-teacher-123',
                    'assignment_id': 'assignment-456',
                    'student_id': 'student-789',
                    'status': 'processed',
                }
            }
            mock_table.update_item.return_value = {}
            
            # SQS fails
            mock_sqs.send_message.side_effect = Exception("SQS error")
            
            response = client.patch(
                f'/essays/{essay_id}/override',
                json={'feedback': [{'word': 'test', 'correct': True, 'comment': ''}]}
            )
            
            # Request should still succeed
            assert response.status_code == 200
            assert 'successful' in response.json()['message'].lower()
    
    def test_override_essay_no_queue_url(self, client):
        """Test override works even when queue URL is not configured."""
        essay_id = 'essay-123'
        
        with patch('app.routes.essays.metrics_table') as mock_table, \
             patch('app.routes.essays.ESSAY_UPDATE_QUEUE_URL', None):
            
            mock_table.get_item.return_value = {
                'Item': {
                    'essay_id': essay_id,
                    'teacher_id': 'test-teacher-123',
                    'assignment_id': 'assignment-456',
                    'student_id': 'student-789',
                    'status': 'processed',
                }
            }
            mock_table.update_item.return_value = {}
            
            response = client.patch(
                f'/essays/{essay_id}/override',
                json={'feedback': [{'word': 'test', 'correct': True, 'comment': ''}]}
            )
            
            assert response.status_code == 200

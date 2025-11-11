"""
Unit tests for metrics API endpoints (Epic 8).
"""
import pytest
import os
from unittest.mock import Mock, patch, MagicMock
from fastapi.testclient import TestClient
from fastapi import HTTPException

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


class TestClassMetrics:
    """Tests for GET /metrics/class/{assignment_id} endpoint."""
    
    def test_get_class_metrics_success(self, client):
        """Test successful retrieval of class metrics."""
        with patch('app.routes.metrics.class_metrics_table') as mock_table:
            mock_table.get_item.return_value = {
                'Item': {
                    'teacher_id': 'test-teacher-123',
                    'assignment_id': 'assignment-456',
                    'stats': {
                        'avg_ttr': 0.85,
                        'avg_freq_rank': 1500.0,
                        'correctness': {'correct': 0.8, 'incorrect': 0.2},
                        'essay_count': 10,
                    },
                    'updated_at': '2025-11-11T12:00:00Z',
                }
            }
            
            response = client.get('/metrics/class/assignment-456')
            
            assert response.status_code == 200
            data = response.json()
            assert data['assignment_id'] == 'assignment-456'
            assert data['stats']['avg_ttr'] == 0.85
            assert data['stats']['essay_count'] == 10
            assert data['updated_at'] == '2025-11-11T12:00:00Z'
    
    def test_get_class_metrics_not_found(self, client):
        """Test class metrics not found returns empty metrics."""
        with patch('app.routes.metrics.class_metrics_table') as mock_table:
            mock_table.get_item.return_value = {}
            
            response = client.get('/metrics/class/assignment-456')
            
            assert response.status_code == 200
            data = response.json()
            assert data['assignment_id'] == 'assignment-456'
            assert data['stats']['avg_ttr'] == 0.0
            assert data['stats']['essay_count'] == 0
    
    def test_get_class_metrics_table_not_configured(self, client):
        """Test error when table is not configured."""
        with patch('app.routes.metrics.class_metrics_table', None):
            response = client.get('/metrics/class/assignment-456')
            
            assert response.status_code == 500
            assert 'not configured' in response.json()['detail'].lower()
    
    def test_get_class_metrics_dynamodb_error(self, client):
        """Test error handling for DynamoDB failures."""
        with patch('app.routes.metrics.class_metrics_table') as mock_table:
            mock_table.get_item.side_effect = Exception("DynamoDB error")
            
            response = client.get('/metrics/class/assignment-456')
            
            assert response.status_code == 500
            assert 'Failed to retrieve' in response.json()['detail']


class TestStudentMetrics:
    """Tests for GET /metrics/student/{student_id} endpoint."""
    
    def test_get_student_metrics_success(self, client):
        """Test successful retrieval of student metrics."""
        with patch('app.routes.metrics.student_metrics_table') as mock_table:
            mock_table.get_item.return_value = {
                'Item': {
                    'teacher_id': 'test-teacher-123',
                    'student_id': 'student-789',
                    'stats': {
                        'avg_ttr': 0.82,
                        'avg_word_count': 450.0,
                        'avg_unique_words': 380.0,
                        'avg_freq_rank': 1800.0,
                        'total_essays': 5,
                        'trend': 'improving',
                        'last_essay_date': '2025-11-11T10:00:00Z',
                    },
                    'updated_at': '2025-11-11T12:00:00Z',
                }
            }
            
            response = client.get('/metrics/student/student-789')
            
            assert response.status_code == 200
            data = response.json()
            assert data['student_id'] == 'student-789'
            assert data['stats']['avg_ttr'] == 0.82
            assert data['stats']['total_essays'] == 5
            assert data['stats']['trend'] == 'improving'
            assert data['updated_at'] == '2025-11-11T12:00:00Z'
    
    def test_get_student_metrics_not_found(self, client):
        """Test student metrics not found returns empty metrics."""
        with patch('app.routes.metrics.student_metrics_table') as mock_table:
            mock_table.get_item.return_value = {}
            
            response = client.get('/metrics/student/student-789')
            
            assert response.status_code == 200
            data = response.json()
            assert data['student_id'] == 'student-789'
            assert data['stats']['avg_ttr'] == 0.0
            assert data['stats']['total_essays'] == 0
            assert data['stats']['trend'] == 'stable'
    
    def test_get_student_metrics_table_not_configured(self, client):
        """Test error when table is not configured."""
        with patch('app.routes.metrics.student_metrics_table', None):
            response = client.get('/metrics/student/student-789')
            
            assert response.status_code == 500
            assert 'not configured' in response.json()['detail'].lower()
    
    def test_get_student_metrics_dynamodb_error(self, client):
        """Test error handling for DynamoDB failures."""
        with patch('app.routes.metrics.student_metrics_table') as mock_table:
            mock_table.get_item.side_effect = Exception("DynamoDB error")
            
            response = client.get('/metrics/student/student-789')
            
            assert response.status_code == 500
            assert 'Failed to retrieve' in response.json()['detail']


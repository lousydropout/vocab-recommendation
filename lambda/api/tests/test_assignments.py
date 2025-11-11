"""
Unit tests for assignment management endpoints and database operations.
"""
import pytest
import os
from unittest.mock import Mock, patch

# Set environment variables before importing modules
os.environ['ASSIGNMENTS_TABLE'] = 'test-assignments-table'

from app.db.assignments import (
    create_assignment,
    get_assignment,
    list_assignments,
)


@pytest.fixture
def mock_table():
    """Mock DynamoDB table"""
    with patch('app.db.assignments.table') as mock_table:
        yield mock_table


@pytest.fixture
def sample_assignment():
    """Sample assignment data"""
    return {
        'teacher_id': 'teacher-123',
        'assignment_id': 'assignment-456',
        'name': 'Unit 3 Essay',
        'description': 'Write about ecosystems',
        'created_at': '2025-01-01T00:00:00',
        'updated_at': '2025-01-01T00:00:00',
    }


class TestCreateAssignment:
    def test_create_assignment_success(self, mock_table, sample_assignment):
        """Test successful assignment creation"""
        mock_table.put_item.return_value = None
        
        result = create_assignment(
            teacher_id='teacher-123',
            name='Unit 3 Essay',
            description='Write about ecosystems'
        )
        
        assert result['teacher_id'] == 'teacher-123'
        assert result['name'] == 'Unit 3 Essay'
        assert result['description'] == 'Write about ecosystems'
        assert 'assignment_id' in result
        assert 'created_at' in result
        mock_table.put_item.assert_called_once()
    
    def test_create_assignment_minimal(self, mock_table):
        """Test assignment creation with minimal data"""
        mock_table.put_item.return_value = None
        
        result = create_assignment(
            teacher_id='teacher-123',
            name='Unit 4 Essay'
        )
        
        assert result['name'] == 'Unit 4 Essay'
        assert result.get('description') == ''


class TestGetAssignment:
    def test_get_assignment_exists(self, mock_table, sample_assignment):
        """Test getting existing assignment"""
        mock_table.get_item.return_value = {'Item': sample_assignment}
        
        result = get_assignment('teacher-123', 'assignment-456')
        
        assert result == sample_assignment
        mock_table.get_item.assert_called_once_with(
            Key={'teacher_id': 'teacher-123', 'assignment_id': 'assignment-456'}
        )
    
    def test_get_assignment_not_found(self, mock_table):
        """Test getting non-existent assignment"""
        mock_table.get_item.return_value = {}
        
        result = get_assignment('teacher-123', 'assignment-999')
        
        assert result is None


class TestListAssignments:
    def test_list_assignments_success(self, mock_table, sample_assignment):
        """Test listing assignments"""
        mock_table.query.return_value = {'Items': [sample_assignment]}
        
        result = list_assignments('teacher-123')
        
        assert len(result) == 1
        assert result[0] == sample_assignment
        mock_table.query.assert_called_once()
    
    def test_list_assignments_empty(self, mock_table):
        """Test listing assignments when none exist"""
        mock_table.query.return_value = {'Items': []}
        
        result = list_assignments('teacher-123')
        
        assert result == []


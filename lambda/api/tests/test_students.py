"""
Unit tests for student management endpoints and database operations.
"""
import pytest
import os
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime

# Set environment variables before importing modules
os.environ['STUDENTS_TABLE'] = 'test-students-table'

from app.db.students import (
    create_student,
    get_student,
    list_students,
    update_student,
    delete_student,
)


@pytest.fixture
def mock_table():
    """Mock DynamoDB table"""
    with patch('app.db.students.table') as mock_table:
        yield mock_table


@pytest.fixture
def sample_student():
    """Sample student data"""
    return {
        'teacher_id': 'teacher-123',
        'student_id': 'student-456',
        'name': 'John Doe',
        'grade_level': 10,
        'notes': 'Test student',
        'created_at': '2025-01-01T00:00:00',
        'updated_at': '2025-01-01T00:00:00',
    }


class TestCreateStudent:
    def test_create_student_success(self, mock_table, sample_student):
        """Test successful student creation"""
        mock_table.put_item.return_value = None
        
        result = create_student(
            teacher_id='teacher-123',
            name='John Doe',
            grade_level=10,
            notes='Test student'
        )
        
        assert result['teacher_id'] == 'teacher-123'
        assert result['name'] == 'John Doe'
        assert result['grade_level'] == 10
        assert 'student_id' in result
        assert 'created_at' in result
        mock_table.put_item.assert_called_once()
    
    def test_create_student_minimal(self, mock_table):
        """Test student creation with minimal data"""
        mock_table.put_item.return_value = None
        
        result = create_student(
            teacher_id='teacher-123',
            name='Jane Smith'
        )
        
        assert result['name'] == 'Jane Smith'
        assert result.get('grade_level') is None
        assert result.get('notes') == ''


class TestGetStudent:
    def test_get_student_exists(self, mock_table, sample_student):
        """Test getting existing student"""
        mock_table.get_item.return_value = {'Item': sample_student}
        
        result = get_student('teacher-123', 'student-456')
        
        assert result == sample_student
        mock_table.get_item.assert_called_once_with(
            Key={'teacher_id': 'teacher-123', 'student_id': 'student-456'}
        )
    
    def test_get_student_not_found(self, mock_table):
        """Test getting non-existent student"""
        mock_table.get_item.return_value = {}
        
        result = get_student('teacher-123', 'student-999')
        
        assert result is None


class TestListStudents:
    def test_list_students_success(self, mock_table, sample_student):
        """Test listing students"""
        mock_table.query.return_value = {'Items': [sample_student]}
        
        result = list_students('teacher-123')
        
        assert len(result) == 1
        assert result[0] == sample_student
        mock_table.query.assert_called_once()
    
    def test_list_students_empty(self, mock_table):
        """Test listing students when none exist"""
        mock_table.query.return_value = {'Items': []}
        
        result = list_students('teacher-123')
        
        assert result == []


class TestUpdateStudent:
    def test_update_student_name(self, mock_table, sample_student):
        """Test updating student name"""
        updated_student = {**sample_student, 'name': 'John Updated'}
        mock_table.update_item.return_value = None
        mock_table.get_item.return_value = {'Item': updated_student}
        
        result = update_student(
            teacher_id='teacher-123',
            student_id='student-456',
            name='John Updated'
        )
        
        assert result['name'] == 'John Updated'
        mock_table.update_item.assert_called_once()
    
    def test_update_student_grade_level(self, mock_table, sample_student):
        """Test updating student grade level"""
        updated_student = {**sample_student, 'grade_level': 11}
        mock_table.update_item.return_value = None
        mock_table.get_item.return_value = {'Item': updated_student}
        
        result = update_student(
            teacher_id='teacher-123',
            student_id='student-456',
            grade_level=11
        )
        
        assert result['grade_level'] == 11


class TestDeleteStudent:
    def test_delete_student_success(self, mock_table):
        """Test successful student deletion"""
        mock_table.delete_item.return_value = None
        
        result = delete_student('teacher-123', 'student-456')
        
        assert result is True
        mock_table.delete_item.assert_called_once_with(
            Key={'teacher_id': 'teacher-123', 'student_id': 'student-456'}
        )
    
    def test_delete_student_error(self, mock_table):
        """Test student deletion with error"""
        mock_table.delete_item.side_effect = Exception('Database error')
        
        result = delete_student('teacher-123', 'student-456')
        
        assert result is False


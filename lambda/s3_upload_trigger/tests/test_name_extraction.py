"""
Unit tests for student name extraction from essay text.
"""
import pytest
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from name_extraction import extract_student_name_from_text, normalize_name


class TestExtractStudentName:
    def test_pattern1_name_colon(self):
        """Test Pattern 1: 'Name: <name>'"""
        text = "Name: John Doe\n\nThis is my essay..."
        result = extract_student_name_from_text(text)
        assert result == "John Doe"
    
    def test_pattern2_name_dash_grade(self):
        """Test Pattern 2: '<name> — Grade'"""
        text = "Jane Smith — Grade 10\n\nEssay content here..."
        result = extract_student_name_from_text(text)
        assert result == "Jane Smith"
    
    def test_pattern3_by_name(self):
        """Test Pattern 3: 'By <name>'"""
        text = "By Michael Johnson\n\nThis essay discusses..."
        result = extract_student_name_from_text(text)
        assert result == "Michael Johnson"
    
    def test_pattern4_first_line_capitalized(self):
        """Test Pattern 4: First line with capitalized words"""
        text = "Sarah Williams\n\nThis is the essay content..."
        result = extract_student_name_from_text(text)
        assert result == "Sarah Williams"
    
    def test_no_name_found(self):
        """Test when no name pattern matches"""
        text = "This is an essay without a name header.\nIt just starts with content."
        result = extract_student_name_from_text(text)
        assert result is None
    
    def test_empty_text(self):
        """Test with empty text"""
        result = extract_student_name_from_text("")
        assert result is None
    
    def test_common_starter_words_ignored(self):
        """Test that common essay starters are not mistaken for names"""
        text = "The importance of education cannot be overstated..."
        result = extract_student_name_from_text(text)
        # Should not match "The" as a name
        assert result is None or result != "The"
    
    def test_multiple_words_name(self):
        """Test name with multiple words"""
        text = "Name: Mary Elizabeth Johnson\n\nEssay starts here..."
        result = extract_student_name_from_text(text)
        assert result == "Mary Elizabeth Johnson"


class TestNormalizeName:
    def test_lowercase(self):
        """Test name normalization to lowercase"""
        assert normalize_name("John Doe") == "john doe"
    
    def test_remove_punctuation(self):
        """Test removing punctuation"""
        assert normalize_name("John, Doe") == "john doe"
        assert normalize_name("O'Brien") == "obrien"
    
    def test_normalize_whitespace(self):
        """Test normalizing whitespace"""
        assert normalize_name("John   Doe") == "john doe"
        assert normalize_name("  John  Doe  ") == "john doe"
    
    def test_empty_string(self):
        """Test with empty string"""
        assert normalize_name("") == ""
    
    def test_special_characters(self):
        """Test with special characters"""
        assert normalize_name("José García") == "josé garcía"  # Accents preserved in lowercase
        assert normalize_name("Mary-Jane") == "maryjane"  # Hyphens are removed (punctuation)


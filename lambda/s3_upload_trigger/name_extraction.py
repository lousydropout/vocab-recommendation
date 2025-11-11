"""
Student name extraction from essay text.
Uses regex patterns and can be extended with spaCy NER.
"""
import re
import logging
from typing import Optional, List

logger = logging.getLogger()


def extract_student_name_from_text(text: str) -> Optional[str]:
    """
    Extract student name from essay text using regex patterns.
    
    Patterns tried:
    1. "Name: <name>" at the start
    2. "<name> — Grade" at the start
    3. "By <name>" at the start
    4. First capitalized words in first line (if looks like a name)
    
    Returns:
        Extracted name if found, None otherwise
    """
    if not text:
        return None
    
    # Normalize text
    text = text.strip()
    lines = text.split('\n')
    first_line = lines[0].strip() if lines else ''
    first_100_chars = text[:100]
    
    # Pattern 1: "Name: <name>" or "Name: <name>"
    name_pattern1 = re.compile(r'^Name:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)', re.IGNORECASE)
    match = name_pattern1.search(first_line)
    if match:
        name = match.group(1).strip()
        logger.info("Name extracted via Pattern 1", extra={"extracted_name": name})
        return name
    
    # Pattern 2: "<name> — Grade" or "<name> - Grade"
    name_pattern2 = re.compile(r'^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*[—\-]\s*Grade', re.IGNORECASE)
    match = name_pattern2.search(first_line)
    if match:
        name = match.group(1).strip()
        logger.info("Name extracted via Pattern 2", extra={"extracted_name": name})
        return name
    
    # Pattern 3: "By <name>" at start
    name_pattern3 = re.compile(r'^By\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)', re.IGNORECASE)
    match = name_pattern3.search(first_line)
    if match:
        name = match.group(1).strip()
        logger.info("Name extracted via Pattern 3", extra={"extracted_name": name})
        return name
    
    # Pattern 4: First 1-3 capitalized words in first line (if looks like a name)
    # This is a fallback - less reliable
    words = first_line.split()
    if len(words) >= 1 and len(words) <= 3:
        potential_name = ' '.join(words[:min(3, len(words))])
        # Check if all words start with capital letters and are reasonable length
        if all(word[0].isupper() and len(word) > 1 and word.isalpha() for word in potential_name.split()):
            # Additional check: not common essay starters
            common_starters = {'The', 'In', 'This', 'That', 'When', 'Where', 'Why', 'How', 'What', 'Essay', 'Introduction'}
            if not any(word in common_starters for word in potential_name.split()):
                logger.info("Name extracted via Pattern 4 (fallback)", extra={"extracted_name": potential_name})
                return potential_name
    
    logger.debug("No name pattern matched", extra={"first_line": first_line[:50]})
    return None


def normalize_name(name: str) -> str:
    """
    Normalize name for fuzzy matching.
    - Convert to lowercase
    - Remove extra whitespace
    - Remove punctuation
    """
    if not name:
        return ''
    # Convert to lowercase, remove punctuation, normalize whitespace
    normalized = re.sub(r'[^\w\s]', '', name.lower())
    normalized = ' '.join(normalized.split())
    return normalized


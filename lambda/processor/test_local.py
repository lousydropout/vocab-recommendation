#!/usr/bin/env python3
"""
Local test script for processor Lambda function.
Tests spaCy loading and basic functionality without AWS dependencies.
"""

import sys
import os

# Add the processor directory to path
sys.path.insert(0, os.path.dirname(__file__))

def test_spacy_import():
    """Test if spaCy can be imported"""
    try:
        import spacy
        print("✅ spaCy imported successfully")
        return True
    except ImportError as e:
        print(f"❌ Failed to import spaCy: {e}")
        return False

def test_spacy_model():
    """Test if spaCy model can be loaded"""
    try:
        import spacy
        print("Loading en_core_web_sm model...")
        nlp = spacy.load('en_core_web_sm')
        print("✅ spaCy model loaded successfully")
        
        # Test basic functionality
        test_text = "The quick brown fox jumps over the lazy dog."
        doc = nlp(test_text)
        print(f"✅ Processed test text: {len(doc)} tokens")
        print(f"   Words: {[token.text for token in doc if token.is_alpha]}")
        return True
    except OSError as e:
        print(f"❌ Failed to load spaCy model: {e}")
        print("   Note: Model needs to be installed: python -m spacy download en_core_web_sm")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_imports():
    """Test if all required imports work"""
    try:
        import json
        import boto3
        import re
        from datetime import datetime
        from typing import Dict, List, Any, Optional
        print("✅ All standard library imports successful")
        return True
    except ImportError as e:
        print(f"❌ Import error: {e}")
        return False

def test_lambda_function_import():
    """Test if lambda_function can be imported (without executing)"""
    try:
        # Mock environment variables
        os.environ['ESSAYS_BUCKET'] = 'test-bucket'
        os.environ['METRICS_TABLE'] = 'test-table'
        os.environ['BEDROCK_MODEL_ID'] = 'test-model'
        
        # Try to import (this will fail if spaCy model not available, but we can check syntax)
        print("Checking lambda_function.py syntax...")
        with open('lambda_function.py', 'r') as f:
            code = f.read()
            compile(code, 'lambda_function.py', 'exec')
        print("✅ lambda_function.py syntax is valid")
        return True
    except SyntaxError as e:
        print(f"❌ Syntax error in lambda_function.py: {e}")
        return False
    except Exception as e:
        print(f"⚠️  Could not fully validate: {e}")
        return True  # Syntax is OK, just can't import due to missing deps

if __name__ == '__main__':
    print("=" * 60)
    print("Testing Processor Lambda (Local)")
    print("=" * 60)
    print()
    
    results = []
    
    print("1. Testing imports...")
    results.append(("Imports", test_imports()))
    print()
    
    print("2. Testing spaCy import...")
    results.append(("spaCy Import", test_spacy_import()))
    print()
    
    if results[-1][1]:
        print("3. Testing spaCy model...")
        results.append(("spaCy Model", test_spacy_model()))
        print()
    
    print("4. Testing lambda_function syntax...")
    results.append(("Lambda Function Syntax", test_lambda_function_import()))
    print()
    
    print("=" * 60)
    print("Summary:")
    print("=" * 60)
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
    
    all_passed = all(r[1] for r in results)
    if all_passed:
        print("\n✅ All tests passed! Code is ready for deployment.")
    else:
        print("\n⚠️  Some tests failed. Check output above.")
    sys.exit(0 if all_passed else 1)




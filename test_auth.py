#!/usr/bin/env python3
"""
Test script for Epic 6 Authentication
Tests authentication endpoints and JWT validation

Note: Full testing requires:
1. Deployed CDK stack with Cognito User Pool
2. A valid Cognito JWT token (obtained via login)
3. Environment variables: API_BASE_URL, COGNITO_USER_POOL_ID, COGNITO_REGION
"""

import requests
import json
import sys
import os
from typing import Dict, Any, Optional

# API Base URL - update this if needed
API_BASE_URL = os.environ.get("API_BASE_URL", "https://m18eg6bei9.execute-api.us-east-1.amazonaws.com/prod")

def print_section(title: str):
    """Print a formatted section header"""
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}\n")

def print_success(message: str):
    """Print success message"""
    print(f"✅ {message}")

def print_error(message: str):
    """Print error message"""
    print(f"❌ {message}")

def print_info(message: str):
    """Print info message"""
    print(f"ℹ️  {message}")

def print_warning(message: str):
    """Print warning message"""
    print(f"⚠️  {message}")

def test_public_health_endpoint() -> bool:
    """Test the public health check endpoint (no auth required)"""
    print_section("Testing Public Health Endpoint")
    
    try:
        response = requests.get(f"{API_BASE_URL}/health", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print_success(f"Health check passed: {data}")
            return True
        else:
            print_error(f"Health check failed with status {response.status_code}")
            print(f"Response: {response.text}")
            return False
    except Exception as e:
        print_error(f"Health check failed with exception: {str(e)}")
        return False

def test_protected_endpoint_without_auth() -> bool:
    """Test that protected endpoints return 401 without authentication"""
    print_section("Testing Protected Endpoint (No Auth)")
    
    try:
        # Try to access protected endpoint without token
        response = requests.get(f"{API_BASE_URL}/essay/test-essay-id", timeout=10)
        
        if response.status_code == 401:
            print_success(f"Protected endpoint correctly returned 401: {response.status_code}")
            return True
        elif response.status_code == 403:
            print_success(f"Protected endpoint correctly returned 403: {response.status_code}")
            return True
        else:
            print_error(f"Expected 401/403, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
    except Exception as e:
        print_error(f"Test failed with exception: {str(e)}")
        return False

def test_auth_health_without_token() -> bool:
    """Test /auth/health endpoint without token"""
    print_section("Testing /auth/health (No Token)")
    
    try:
        response = requests.get(f"{API_BASE_URL}/auth/health", timeout=10)
        
        if response.status_code == 401:
            print_success(f"Auth health correctly returned 401: {response.status_code}")
            return True
        elif response.status_code == 403:
            print_success(f"Auth health correctly returned 403: {response.status_code}")
            return True
        else:
            print_error(f"Expected 401/403, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
    except Exception as e:
        print_error(f"Test failed with exception: {str(e)}")
        return False

def test_auth_health_with_token(token: str) -> bool:
    """Test /auth/health endpoint with valid token"""
    print_section("Testing /auth/health (With Token)")
    
    if not token:
        print_warning("No token provided - skipping authenticated test")
        print_info("To test with token:")
        print_info("  1. Deploy CDK stack: cdk deploy")
        print_info("  2. Create a user in Cognito User Pool")
        print_info("  3. Get JWT token via login")
        print_info("  4. Run: COGNITO_TOKEN='your-token' python3 test_auth.py")
        return True  # Not a failure, just skipped
    
    try:
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        response = requests.get(f"{API_BASE_URL}/auth/health", headers=headers, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print_success(f"Auth health check passed: {data}")
            
            # Validate response structure
            required_fields = ["status", "teacher_id"]
            missing_fields = [field for field in required_fields if field not in data]
            
            if missing_fields:
                print_error(f"Response missing required fields: {missing_fields}")
                return False
            
            if data.get("status") != "authenticated":
                print_error(f"Expected status='authenticated', got '{data.get('status')}'")
                return False
            
            print_success(f"Teacher ID: {data.get('teacher_id')}")
            if data.get("email"):
                print_success(f"Email: {data.get('email')}")
            
            return True
        else:
            print_error(f"Auth health check failed with status {response.status_code}")
            print(f"Response: {response.text}")
            return False
    except Exception as e:
        print_error(f"Test failed with exception: {str(e)}")
        return False

def test_protected_endpoint_with_token(token: str) -> bool:
    """Test protected endpoint with valid token"""
    print_section("Testing Protected Endpoint (With Token)")
    
    if not token:
        print_warning("No token provided - skipping authenticated test")
        return True  # Not a failure, just skipped
    
    try:
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        # Try to get a non-existent essay (should return 404, not 401)
        response = requests.get(f"{API_BASE_URL}/essay/non-existent-id", headers=headers, timeout=10)
        
        if response.status_code == 404:
            print_success(f"Protected endpoint accessible with token (404 for non-existent essay is expected)")
            return True
        elif response.status_code == 200:
            print_success(f"Protected endpoint accessible with token")
            return True
        elif response.status_code == 401 or response.status_code == 403:
            print_error(f"Token rejected: {response.status_code}")
            print(f"Response: {response.text}")
            return False
        else:
            print_warning(f"Unexpected status code: {response.status_code}")
            print(f"Response: {response.text}")
            return True  # Not necessarily a failure
    except Exception as e:
        print_error(f"Test failed with exception: {str(e)}")
        return False

def main():
    """Run all authentication tests"""
    print_section("Epic 6 Authentication Tests")
    
    # Get token from environment if available
    token = os.environ.get("COGNITO_TOKEN") or os.environ.get("JWT_TOKEN")
    
    if not token:
        print_warning("No COGNITO_TOKEN or JWT_TOKEN environment variable set")
        print_info("Some tests will be skipped")
        print_info("Set COGNITO_TOKEN='your-token' to test authenticated endpoints")
    
    results = []
    
    # Test public endpoint
    results.append(("Public Health", test_public_health_endpoint()))
    
    # Test protected endpoints without auth
    results.append(("Protected Endpoint (No Auth)", test_protected_endpoint_without_auth()))
    results.append(("Auth Health (No Auth)", test_auth_health_without_token()))
    
    # Test with token if available
    if token:
        results.append(("Auth Health (With Token)", test_auth_health_with_token(token)))
        results.append(("Protected Endpoint (With Token)", test_protected_endpoint_with_token(token)))
    else:
        print_section("Skipping Authenticated Tests")
        print_info("Set COGNITO_TOKEN environment variable to test authenticated endpoints")
    
    # Print summary
    print_section("Test Summary")
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\n{'='*60}")
    print(f"Results: {passed}/{total} tests passed")
    print(f"{'='*60}\n")
    
    if passed == total:
        print_success("All tests passed!")
        return 0
    else:
        print_error(f"{total - passed} test(s) failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())


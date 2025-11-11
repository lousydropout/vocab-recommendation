#!/usr/bin/env python3
"""
Test script for Vocabulary Essay Analyzer API
Tests all endpoints and validates responses
"""

import requests
import json
import sys
import time
from typing import Dict, Any

# API Base URL - update this if needed
API_BASE_URL = "https://m18eg6bei9.execute-api.us-east-1.amazonaws.com/prod"

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

def test_health_endpoint() -> bool:
    """Test the health check endpoint"""
    print_section("Testing Health Endpoint")
    
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

def test_post_essay_direct_upload() -> Dict[str, Any]:
    """Test POST /essay with direct text upload"""
    print_section("Testing POST /essay (Direct Upload)")
    
    test_essay = """
    The rapid advancement of technology has fundamentally transformed 
    how we communicate and interact with the world. Modern devices 
    enable instantaneous connections across vast distances, facilitating 
    unprecedented levels of collaboration and information exchange.
    """
    
    payload = {
        "essay_text": test_essay.strip()
    }
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/essay",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            print_success(f"Essay created successfully!")
            print(f"   Essay ID: {data.get('essay_id')}")
            print(f"   Status: {data.get('status')}")
            print(f"   Presigned URL: {data.get('presigned_url', 'N/A (direct upload)')}")
            return data
        else:
            print_error(f"Failed with status {response.status_code}")
            print(f"Response: {response.text}")
            return {}
    except Exception as e:
        print_error(f"Request failed with exception: {str(e)}")
        return {}

def test_post_essay_presigned_url() -> Dict[str, Any]:
    """Test POST /essay requesting presigned URL"""
    print_section("Testing POST /essay (Presigned URL Request)")
    
    payload = {
        "request_presigned_url": True
    }
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/essay",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            print_success(f"Presigned URL generated successfully!")
            print(f"   Essay ID: {data.get('essay_id')}")
            print(f"   Status: {data.get('status')}")
            print(f"   Presigned URL: {data.get('presigned_url', 'N/A')[:80]}...")
            print(f"   Expires in: {data.get('expires_in')} seconds")
            return data
        else:
            print_error(f"Failed with status {response.status_code}")
            print(f"Response: {response.text}")
            return {}
    except Exception as e:
        print_error(f"Request failed with exception: {str(e)}")
        return {}

def test_get_essay(essay_id: str) -> bool:
    """Test GET /essay/{essay_id} endpoint"""
    print_section(f"Testing GET /essay/{essay_id}")
    
    try:
        response = requests.get(
            f"{API_BASE_URL}/essay/{essay_id}",
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            print_success(f"Essay retrieved successfully!")
            print(f"   Essay ID: {data.get('essay_id')}")
            print(f"   Status: {data.get('status')}")
            print(f"   File Key: {data.get('file_key')}")
            
            if data.get('metrics'):
                print(f"   Metrics: {json.dumps(data.get('metrics'), indent=6)}")
            else:
                print(f"   Metrics: Not yet processed")
            
            if data.get('feedback'):
                print(f"   Feedback: {len(data.get('feedback', []))} items")
            else:
                print(f"   Feedback: Not yet processed")
            
            print(f"   Created: {data.get('created_at')}")
            print(f"   Updated: {data.get('updated_at')}")
            return True
        elif response.status_code == 404:
            print_error(f"Essay not found (404)")
            return False
        else:
            print_error(f"Failed with status {response.status_code}")
            print(f"Response: {response.text}")
            return False
    except Exception as e:
        print_error(f"Request failed with exception: {str(e)}")
        return False

def test_get_nonexistent_essay() -> bool:
    """Test GET /essay/{essay_id} with non-existent ID"""
    print_section("Testing GET /essay (Non-existent ID)")
    
    fake_id = "00000000-0000-0000-0000-000000000000"
    
    try:
        response = requests.get(
            f"{API_BASE_URL}/essay/{fake_id}",
            timeout=30
        )
        
        if response.status_code == 404:
            print_success(f"Correctly returned 404 for non-existent essay")
            return True
        else:
            print_error(f"Expected 404, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
    except Exception as e:
        print_error(f"Request failed with exception: {str(e)}")
        return False

def test_empty_post_request() -> bool:
    """Test POST /essay with empty request (should default to presigned URL)"""
    print_section("Testing POST /essay (Empty Request - Defaults to Presigned URL)")
    
    # Send request without essay_text or request_presigned_url
    # API should default to generating a presigned URL
    payload = {}
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/essay",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get('presigned_url'):
                print_success(f"Empty request correctly defaults to presigned URL mode")
                print(f"   Essay ID: {data.get('essay_id')}")
                return True
            else:
                print_error(f"Expected presigned URL in response")
                return False
        else:
            print_error(f"Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
    except Exception as e:
        print_error(f"Request failed with exception: {str(e)}")
        return False

def main():
    """Run all tests"""
    print("\n" + "="*60)
    print("  Vocabulary Essay Analyzer API Test Suite")
    print("="*60)
    
    results = {
        "health": False,
        "post_direct": False,
        "post_presigned": False,
        "get_existing": False,
        "get_nonexistent": False,
        "empty_request": False,
    }
    
    # Test health endpoint
    results["health"] = test_health_endpoint()
    
    if not results["health"]:
        print_error("\nHealth check failed. API may not be accessible.")
        print_info("Please check the API_BASE_URL in the script.")
        sys.exit(1)
    
    # Test POST with direct upload
    direct_upload_result = test_post_essay_direct_upload()
    if direct_upload_result and direct_upload_result.get('essay_id'):
        results["post_direct"] = True
        direct_essay_id = direct_upload_result['essay_id']
        
        # Wait a moment for S3 event to process
        print_info("Waiting 2 seconds for S3 event processing...")
        time.sleep(2)
        
        # Test GET with the created essay
        results["get_existing"] = test_get_essay(direct_essay_id)
    else:
        print_error("Direct upload test failed, skipping GET test")
    
    # Test POST requesting presigned URL
    presigned_result = test_post_essay_presigned_url()
    if presigned_result and presigned_result.get('essay_id'):
        results["post_presigned"] = True
    else:
        print_error("Presigned URL test failed")
    
    # Test GET with non-existent ID
    results["get_nonexistent"] = test_get_nonexistent_essay()
    
    # Test empty POST request (defaults to presigned URL)
    results["empty_request"] = test_empty_post_request()
    
    # Print summary
    print_section("Test Summary")
    
    total_tests = len(results)
    passed_tests = sum(1 for v in results.values() if v)
    
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"  {status} - {test_name}")
    
    print(f"\n  Results: {passed_tests}/{total_tests} tests passed")
    
    if passed_tests == total_tests:
        print_success("All tests passed! 🎉")
        sys.exit(0)
    else:
        print_error(f"{total_tests - passed_tests} test(s) failed")
        sys.exit(1)

if __name__ == "__main__":
    main()


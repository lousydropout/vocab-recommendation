#!/usr/bin/env python3
"""
Integration tests for Epic 8: Analytics & Teacher Review Interface
Tests metrics endpoints and essay override functionality.
"""
import os
import requests
import json
import boto3
import time
from typing import Dict, Any, Optional
from botocore.exceptions import ClientError

# API Base URL
API_BASE_URL = os.environ.get('API_URL', 'https://m18eg6bei9.execute-api.us-east-1.amazonaws.com/prod')

# Cognito Configuration
COGNITO_USER_POOL_ID = os.environ.get('COGNITO_USER_POOL_ID', 'us-east-1_65hpvHpPX')
COGNITO_CLIENT_ID = os.environ.get('COGNITO_CLIENT_ID', 'jhnvud4iqcf15vac6nc2d2b9p')
COGNITO_REGION = os.environ.get('COGNITO_REGION', 'us-east-1')

# Test credentials
TEST_EMAIL = os.environ.get('TEST_EMAIL', 'test-teacher@example.com')
TEST_PASSWORD = os.environ.get('TEST_PASSWORD', 'Test1234!')

cognito_client = boto3.client('cognito-idp', region_name=COGNITO_REGION)


def print_section(title: str):
    """Print section header"""
    print(f"\n{'='*60}")
    print(f"  {title}")
    print('='*60)


def print_success(message: str):
    """Print success message"""
    print(f"✅ {message}")


def print_error(message: str):
    """Print error message"""
    print(f"❌ {message}")


def print_info(message: str):
    """Print info message"""
    print(f"ℹ️  {message}")


def get_auth_token():
    """Get JWT token from Cognito"""
    try:
        response = cognito_client.initiate_auth(
            ClientId=COGNITO_CLIENT_ID,
            AuthFlow='USER_PASSWORD_AUTH',
            AuthParameters={
                'USERNAME': TEST_EMAIL,
                'PASSWORD': TEST_PASSWORD,
            }
        )
        
        if 'ChallengeName' in response and response['ChallengeName'] == 'NEW_PASSWORD_REQUIRED':
            challenge_response = cognito_client.respond_to_auth_challenge(
                ClientId=COGNITO_CLIENT_ID,
                ChallengeName='NEW_PASSWORD_REQUIRED',
                Session=response['Session'],
                ChallengeResponses={
                    'USERNAME': TEST_EMAIL,
                    'NEW_PASSWORD': TEST_PASSWORD,
                }
            )
            auth_result = challenge_response['AuthenticationResult']
        else:
            auth_result = response['AuthenticationResult']
        
        return auth_result.get('IdToken') or auth_result.get('AccessToken')
    except Exception as e:
        print_error(f"Failed to get auth token: {str(e)}")
        return None


def create_test_assignment(token: str) -> Optional[str]:
    """Create a test assignment"""
    try:
        response = requests.post(
            f"{API_BASE_URL}/assignments",
            json={
                "name": "Epic 8 Test Assignment",
                "description": "Test assignment for Epic 8 integration tests",
            },
            headers={"Authorization": f"Bearer {token}"},
            timeout=30
        )
        
        if response.status_code in [200, 201]:
            data = response.json()
            assignment_id = data.get('assignment_id')
            print_success(f"Assignment created: {assignment_id}")
            return assignment_id
        else:
            print_error(f"Failed to create assignment: {response.status_code}")
            print(f"Response: {response.text}")
            return None
    except Exception as e:
        print_error(f"Exception creating assignment: {str(e)}")
        return None


def create_test_student(token: str) -> Optional[str]:
    """Create a test student"""
    try:
        response = requests.post(
            f"{API_BASE_URL}/students",
            json={
                "name": "Test Student",
                "grade_level": 10,
            },
            headers={"Authorization": f"Bearer {token}"},
            timeout=30
        )
        
        if response.status_code in [200, 201]:
            data = response.json()
            student_id = data.get('student_id')
            print_success(f"Student created: {student_id}")
            return student_id
        else:
            print_error(f"Failed to create student: {response.status_code}")
            print(f"Response: {response.text}")
            return None
    except Exception as e:
        print_error(f"Exception creating student: {str(e)}")
        return None


def test_class_metrics(token: str, assignment_id: str) -> bool:
    """Test GET /metrics/class/{assignment_id} endpoint"""
    print_section("Test: Class Metrics Endpoint")
    
    try:
        response = requests.get(
            f"{API_BASE_URL}/metrics/class/{assignment_id}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            print_success("Class metrics retrieved")
            print(f"   Assignment ID: {data.get('assignment_id')}")
            print(f"   Stats: {json.dumps(data.get('stats', {}), indent=2)}")
            print(f"   Updated At: {data.get('updated_at', 'N/A')}")
            return True
        else:
            print_error(f"Failed to get class metrics: {response.status_code}")
            print(f"Response: {response.text}")
            return False
    except Exception as e:
        print_error(f"Exception getting class metrics: {str(e)}")
        return False


def test_student_metrics(token: str, student_id: str) -> bool:
    """Test GET /metrics/student/{student_id} endpoint"""
    print_section("Test: Student Metrics Endpoint")
    
    try:
        response = requests.get(
            f"{API_BASE_URL}/metrics/student/{student_id}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            print_success("Student metrics retrieved")
            print(f"   Student ID: {data.get('student_id')}")
            print(f"   Stats: {json.dumps(data.get('stats', {}), indent=2)}")
            print(f"   Updated At: {data.get('updated_at', 'N/A')}")
            return True
        else:
            print_error(f"Failed to get student metrics: {response.status_code}")
            print(f"Response: {response.text}")
            return False
    except Exception as e:
        print_error(f"Exception getting student metrics: {str(e)}")
        return False


def test_essay_override(token: str, essay_id: str) -> bool:
    """Test PATCH /essays/{essay_id}/override endpoint"""
    print_section("Test: Essay Override Endpoint")
    
    # First, get the essay to see current feedback
    try:
        get_response = requests.get(
            f"{API_BASE_URL}/essay/{essay_id}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=30
        )
        
        if get_response.status_code != 200:
            print_error(f"Failed to get essay: {get_response.status_code}")
            return False
        
        essay_data = get_response.json()
        original_feedback = essay_data.get('feedback', [])
        
        if not original_feedback:
            print_info("Essay has no feedback to override")
            return True
        
        # Create modified feedback (toggle first item's correctness)
        modified_feedback = original_feedback.copy()
        if modified_feedback:
            modified_feedback[0]['correct'] = not modified_feedback[0].get('correct', True)
            modified_feedback[0]['comment'] = 'Overridden by test'
        
        # Override the feedback
        override_response = requests.patch(
            f"{API_BASE_URL}/essays/{essay_id}/override",
            json={"feedback": modified_feedback},
            headers={"Authorization": f"Bearer {token}"},
            timeout=30
        )
        
        if override_response.status_code == 200:
            data = override_response.json()
            print_success("Essay feedback overridden")
            print(f"   Essay ID: {data.get('essay_id')}")
            print(f"   Message: {data.get('message')}")
            
            # Verify the override by getting the essay again
            verify_response = requests.get(
                f"{API_BASE_URL}/essay/{essay_id}",
                headers={"Authorization": f"Bearer {token}"},
                timeout=30
            )
            
            if verify_response.status_code == 200:
                verified_data = verify_response.json()
                verified_feedback = verified_data.get('feedback', [])
                if verified_feedback and verified_feedback[0].get('correct') == modified_feedback[0].get('correct'):
                    print_success("Override verified - feedback updated correctly")
                    return True
                else:
                    print_error("Override not reflected in essay data")
                    return False
            else:
                print_error(f"Failed to verify override: {verify_response.status_code}")
                return False
        else:
            print_error(f"Failed to override feedback: {override_response.status_code}")
            print(f"Response: {override_response.text}")
            return False
    except Exception as e:
        print_error(f"Exception overriding essay: {str(e)}")
        return False


def test_epic8_endpoints():
    """Run all Epic 8 integration tests"""
    print("\n" + "="*60)
    print("  Vocabulary Essay Analyzer - Epic 8 Integration Tests")
    print("="*60)
    
    # Get auth token
    print("\n=== Getting Auth Token ===")
    token = get_auth_token()
    if not token:
        print_error("Failed to get auth token. Cannot run tests.")
        return False
    print_success("Auth token obtained")
    
    # Create test assignment
    assignment_id = create_test_assignment(token)
    if not assignment_id:
        print_error("Failed to create test assignment. Aborting tests.")
        return False
    
    # Create test student
    student_id = create_test_student(token)
    if not student_id:
        print_error("Failed to create test student. Aborting tests.")
        return False
    
    # Test class metrics (may return empty metrics if no essays processed yet)
    class_metrics_ok = test_class_metrics(token, assignment_id)
    
    # Test student metrics (may return empty metrics if no essays processed yet)
    student_metrics_ok = test_student_metrics(token, student_id)
    
    # Test essay override (need an existing essay)
    # For now, we'll just test that the endpoint exists and returns appropriate errors
    print_section("Test: Essay Override Endpoint (with non-existent essay)")
    try:
        response = requests.patch(
            f"{API_BASE_URL}/essays/non-existent-essay-id/override",
            json={"feedback": [{"word": "test", "correct": True, "comment": ""}]},
            headers={"Authorization": f"Bearer {token}"},
            timeout=30
        )
        
        if response.status_code == 404:
            print_success("Override endpoint correctly returns 404 for non-existent essay")
            essay_override_ok = True
        else:
            print_error(f"Unexpected status code: {response.status_code}")
            essay_override_ok = False
    except Exception as e:
        print_error(f"Exception testing override: {str(e)}")
        essay_override_ok = False
    
    # Summary
    print_section("Test Summary")
    print(f"Class Metrics: {'✅ PASSED' if class_metrics_ok else '❌ FAILED'}")
    print(f"Student Metrics: {'✅ PASSED' if student_metrics_ok else '❌ FAILED'}")
    print(f"Essay Override: {'✅ PASSED' if essay_override_ok else '❌ FAILED'}")
    
    all_passed = class_metrics_ok and student_metrics_ok and essay_override_ok
    
    if all_passed:
        print_success("\n✅ All Epic 8 integration tests passed!")
    else:
        print_error("\n❌ Some tests failed")
    
    return all_passed


if __name__ == '__main__':
    success = test_epic8_endpoints()
    exit(0 if success else 1)


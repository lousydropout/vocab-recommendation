"""
Integration tests for Epic 7: Students & Assignments Management.
Tests the full API flow with authentication.
"""
import os
import requests
import json
import time
import boto3
from botocore.exceptions import ClientError

# API Configuration
API_BASE_URL = os.environ.get('API_URL', 'https://m18eg6bei9.execute-api.us-east-1.amazonaws.com/prod')
COGNITO_USER_POOL_ID = os.environ.get('COGNITO_USER_POOL_ID', 'us-east-1_65hpvHpPX')
COGNITO_CLIENT_ID = os.environ.get('COGNITO_CLIENT_ID', 'jhnvud4iqcf15vac6nc2d2b9p')
COGNITO_REGION = os.environ.get('COGNITO_REGION', 'us-east-1')

# Test credentials (you'll need to create a test user or use existing)
TEST_EMAIL = os.environ.get('TEST_EMAIL', 'test@example.com')
TEST_PASSWORD = os.environ.get('TEST_PASSWORD', 'Test1234!')

cognito_client = boto3.client('cognito-idp', region_name=COGNITO_REGION)


def get_auth_token():
    """Get JWT token from Cognito or environment variable"""
    # First try environment variable (for CI/CD or manual testing)
    token = os.environ.get('COGNITO_TOKEN') or os.environ.get('JWT_TOKEN')
    if token:
        print("Using token from environment variable")
        return token
    
    # Otherwise try to get from Cognito
    try:
        response = cognito_client.initiate_auth(
            ClientId=COGNITO_CLIENT_ID,
            AuthFlow='USER_PASSWORD_AUTH',
            AuthParameters={
                'USERNAME': TEST_EMAIL,
                'PASSWORD': TEST_PASSWORD,
            }
        )
        auth_result = response['AuthenticationResult']
        
        # Check if password change is required
        if 'ChallengeName' in response and response['ChallengeName'] == 'NEW_PASSWORD_REQUIRED':
            print("⚠️  Password change required. Attempting to set new password...")
            # Use the same password as the new password
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
        
        # API Gateway Cognito authorizer expects IdToken
        id_token = auth_result.get('IdToken')
        if id_token:
            print(f"✅ Got IdToken (length: {len(id_token)})")
            return id_token
        else:
            print("⚠️  No IdToken in response, trying AccessToken")
            return auth_result.get('AccessToken')
    except ClientError as e:
        print(f"Failed to get auth token: {e}")
        print("\nTo run authenticated tests:")
        print("1. Create a user in Cognito User Pool")
        print("2. Set environment variables:")
        print("   export TEST_EMAIL='your-email@example.com'")
        print("   export TEST_PASSWORD='YourPassword123!'")
        print("   OR")
        print("   export COGNITO_TOKEN='your-jwt-token'")
        return None


def test_health_check():
    """Test public health endpoint"""
    print("\n=== Testing Health Check ===")
    response = requests.get(f"{API_BASE_URL}/health")
    assert response.status_code == 200
    assert response.json()['status'] == 'healthy'
    print("✅ Health check passed")


def test_auth_health(token):
    """Test auth health endpoint first"""
    print("\n=== Testing Auth Health ===")
    headers = {'Authorization': f'Bearer {token}'}
    
    response = requests.get(f"{API_BASE_URL}/auth/health", headers=headers)
    if response.status_code == 200:
        print("✅ Auth health check passed")
        print(f"   Teacher ID: {response.json().get('teacher_id')}")
        return True
    else:
        print(f"❌ Auth health failed: {response.status_code}")
        print(f"   Response: {response.text}")
        return False


def test_students_crud(token):
    """Test Students CRUD operations"""
    print("\n=== Testing Students CRUD ===")
    headers = {'Authorization': f'Bearer {token}'}
    
    # Create student
    print("Creating student...")
    create_response = requests.post(
        f"{API_BASE_URL}/students",
        headers=headers,
        json={
            'name': 'Test Student',
            'grade_level': 10,
            'notes': 'Integration test student'
        }
    )
    if create_response.status_code != 201:
        print(f"❌ Unexpected status code: {create_response.status_code}")
        print(f"Response: {create_response.text}")
    assert create_response.status_code == 201, f"Expected 201, got {create_response.status_code}: {create_response.text}"
    student_data = create_response.json()
    student_id = student_data['student_id']
    print(f"✅ Student created: {student_id}")
    
    # List students
    print("Listing students...")
    list_response = requests.get(f"{API_BASE_URL}/students", headers=headers)
    assert list_response.status_code == 200
    students = list_response.json()
    assert len(students) > 0
    assert any(s['student_id'] == student_id for s in students)
    print(f"✅ Found {len(students)} student(s)")
    
    # Get student
    print(f"Getting student {student_id}...")
    get_response = requests.get(f"{API_BASE_URL}/students/{student_id}", headers=headers)
    assert get_response.status_code == 200
    student = get_response.json()
    assert student['name'] == 'Test Student'
    assert student['grade_level'] == 10
    print("✅ Student retrieved")
    
    # Update student
    print("Updating student...")
    update_response = requests.patch(
        f"{API_BASE_URL}/students/{student_id}",
        headers=headers,
        json={
            'name': 'Updated Test Student',
            'grade_level': 11
        }
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated['name'] == 'Updated Test Student'
    assert updated['grade_level'] == 11
    print("✅ Student updated")
    
    # Delete student
    print("Deleting student...")
    delete_response = requests.delete(f"{API_BASE_URL}/students/{student_id}", headers=headers)
    assert delete_response.status_code == 204
    print("✅ Student deleted")
    
    # Verify deletion
    get_after_delete = requests.get(f"{API_BASE_URL}/students/{student_id}", headers=headers)
    assert get_after_delete.status_code == 404
    print("✅ Student deletion verified")


def test_assignments_crud(token):
    """Test Assignments CRUD operations"""
    print("\n=== Testing Assignments CRUD ===")
    headers = {'Authorization': f'Bearer {token}'}
    
    # Create assignment
    print("Creating assignment...")
    create_response = requests.post(
        f"{API_BASE_URL}/assignments",
        headers=headers,
        json={
            'name': 'Test Assignment',
            'description': 'Integration test assignment'
        }
    )
    assert create_response.status_code == 201
    assignment_data = create_response.json()
    assignment_id = assignment_data['assignment_id']
    print(f"✅ Assignment created: {assignment_id}")
    
    # List assignments
    print("Listing assignments...")
    list_response = requests.get(f"{API_BASE_URL}/assignments", headers=headers)
    assert list_response.status_code == 200
    assignments = list_response.json()
    assert len(assignments) > 0
    assert any(a['assignment_id'] == assignment_id for a in assignments)
    print(f"✅ Found {len(assignments)} assignment(s)")
    
    # Get assignment
    print(f"Getting assignment {assignment_id}...")
    get_response = requests.get(f"{API_BASE_URL}/assignments/{assignment_id}", headers=headers)
    assert get_response.status_code == 200
    assignment = get_response.json()
    assert assignment['name'] == 'Test Assignment'
    print("✅ Assignment retrieved")
    
    # Get presigned upload URL
    print("Getting presigned upload URL...")
    upload_url_response = requests.post(
        f"{API_BASE_URL}/assignments/{assignment_id}/upload-url",
        headers=headers,
        json={'file_name': 'test-essay.zip'}
    )
    assert upload_url_response.status_code == 200
    upload_data = upload_url_response.json()
    assert 'presigned_url' in upload_data
    assert 'file_key' in upload_data
    assert upload_data['expires_in'] == 900
    print(f"✅ Presigned URL generated: {upload_data['file_key']}")


def test_unauthorized_access():
    """Test that endpoints require authentication"""
    print("\n=== Testing Unauthorized Access ===")
    
    # Try to access protected endpoint without token
    response = requests.get(f"{API_BASE_URL}/students")
    assert response.status_code in [401, 403]
    print("✅ Unauthorized access correctly rejected")


def main():
    """Run all integration tests"""
    print("=" * 60)
    print("Epic 7 Integration Tests")
    print("=" * 60)
    
    # Test public endpoint
    test_health_check()
    
    # Test unauthorized access
    test_unauthorized_access()
    
    # Get auth token
    print("\n=== Getting Auth Token ===")
    token = get_auth_token()
    if not token:
        print("❌ Failed to get auth token. Skipping authenticated tests.")
        print("   To run full tests, set TEST_EMAIL and TEST_PASSWORD environment variables")
        print("   and ensure the user exists in Cognito.")
        return
    
    print("✅ Auth token obtained")
    
    # Test authenticated endpoints
    # First verify auth works
    if not test_auth_health(token):
        print("❌ Auth health check failed. Skipping other tests.")
        return
    
    test_students_crud(token)
    test_assignments_crud(token)
    
    print("\n" + "=" * 60)
    print("✅ All integration tests passed!")
    print("=" * 60)


if __name__ == '__main__':
    main()


#!/usr/bin/env python3
"""
End-to-end test for Vocabulary Essay Analyzer Processing Pipeline
Tests the complete flow: Upload → S3 → SQS → Processor → DynamoDB
"""

import os
import requests
import json
import sys
import time
import boto3
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

# Maximum wait time for processing (in seconds)
MAX_WAIT_TIME = 300  # 5 minutes (matches Lambda timeout)
POLL_INTERVAL = 5  # Check every 5 seconds

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

def upload_essay(essay_text: str, token: str) -> Optional[Dict[str, Any]]:
    """Upload an essay via the API"""
    print_section("Step 1: Uploading Essay")
    
    payload = {
        "essay_text": essay_text
    }
    
    try:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}"
        }
        response = requests.post(
            f"{API_BASE_URL}/essay",
            json=payload,
            headers=headers,
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            essay_id = data.get('essay_id')
            status = data.get('status')
            
            print_success(f"Essay uploaded successfully!")
            print(f"   Essay ID: {essay_id}")
            print(f"   Status: {status}")
            print(f"   File Key: {data.get('file_key', 'N/A')}")
            
            if status != 'awaiting_processing':
                print_warning(f"Expected status 'awaiting_processing', got '{status}'")
            
            return data
        else:
            print_error(f"Upload failed with status {response.status_code}")
            print(f"Response: {response.text}")
            return None
    except Exception as e:
        print_error(f"Upload failed with exception: {str(e)}")
        return None

def get_essay_status(essay_id: str, token: str) -> Optional[Dict[str, Any]]:
    """Get the current status of an essay"""
    try:
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(
            f"{API_BASE_URL}/essay/{essay_id}",
            headers=headers,
            timeout=30
        )
        
        if response.status_code == 200:
            return response.json()
        elif response.status_code == 404:
            print_error(f"Essay {essay_id} not found")
            return None
        else:
            print_error(f"Failed to get essay status: {response.status_code}")
            print(f"Response: {response.text}")
            return None
    except Exception as e:
        print_error(f"Failed to get essay status: {str(e)}")
        return None

def wait_for_processing(essay_id: str, token: str) -> Optional[Dict[str, Any]]:
    """Wait for essay processing to complete"""
    print_section("Step 2: Waiting for Processing")
    
    start_time = time.time()
    last_status = None
    
    print_info(f"Polling every {POLL_INTERVAL} seconds (max {MAX_WAIT_TIME}s)...")
    
    while True:
        elapsed = time.time() - start_time
        
        if elapsed > MAX_WAIT_TIME:
            print_error(f"Processing timeout after {MAX_WAIT_TIME} seconds")
            return None
        
        essay_data = get_essay_status(essay_id, token)
        
        if not essay_data:
            return None
        
        current_status = essay_data.get('status')
        
        # Print status updates
        if current_status != last_status:
            print_info(f"[{elapsed:.0f}s] Status: {current_status}")
            last_status = current_status
        
        # Check if processing is complete
        if current_status == 'processed':
            print_success(f"Processing completed in {elapsed:.1f} seconds!")
            return essay_data
        elif current_status == 'processing':
            # Still processing, wait and check again
            time.sleep(POLL_INTERVAL)
        elif current_status == 'awaiting_processing':
            # Not started yet, wait a bit longer
            time.sleep(POLL_INTERVAL)
        else:
            print_warning(f"Unknown status: {current_status}")
            time.sleep(POLL_INTERVAL)

def validate_metrics(metrics: Dict[str, Any]) -> bool:
    """Validate that metrics are present and have expected structure"""
    print_section("Step 3: Validating Metrics")
    
    if not metrics:
        print_error("Metrics are missing")
        return False
    
    required_fields = ['word_count', 'unique_words', 'type_token_ratio']
    optional_fields = ['noun_ratio', 'verb_ratio', 'avg_word_freq_rank']
    
    all_present = True
    
    for field in required_fields:
        if field not in metrics:
            print_error(f"Required metric field missing: {field}")
            all_present = False
        else:
            value = metrics[field]
            print_success(f"{field}: {value}")
    
    for field in optional_fields:
        if field in metrics:
            print_info(f"{field}: {metrics[field]}")
    
    # Validate types
    if 'word_count' in metrics:
        if not isinstance(metrics['word_count'], int) or metrics['word_count'] <= 0:
            print_error(f"word_count should be a positive integer, got: {metrics['word_count']}")
            all_present = False
    
    if 'unique_words' in metrics:
        if not isinstance(metrics['unique_words'], int) or metrics['unique_words'] <= 0:
            print_error(f"unique_words should be a positive integer, got: {metrics['unique_words']}")
            all_present = False
    
    if 'type_token_ratio' in metrics:
        ratio = metrics['type_token_ratio']
        if not isinstance(ratio, (int, float)) or ratio < 0 or ratio > 1:
            print_warning(f"type_token_ratio should be between 0 and 1, got: {ratio}")
    
    return all_present

def validate_feedback(feedback: list) -> bool:
    """Validate that feedback is present and has expected structure"""
    print_section("Step 4: Validating Feedback")
    
    if feedback is None:
        print_error("Feedback is None (should be a list, even if empty)")
        return False
    
    if not isinstance(feedback, list):
        print_error(f"Feedback should be a list, got: {type(feedback)}")
        return False
    
    print_info(f"Feedback contains {len(feedback)} word evaluation(s)")
    
    if len(feedback) == 0:
        print_warning("No feedback items (this may be normal if no candidate words were selected)")
        return True
    
    # Validate each feedback item
    valid_items = 0
    for i, item in enumerate(feedback):
        if not isinstance(item, dict):
            print_error(f"Feedback item {i} is not a dictionary: {type(item)}")
            continue
        
        required_fields = ['word']
        has_word = 'word' in item
        
        if has_word:
            word = item['word']
            correct = item.get('correct', None)
            comment = item.get('comment', '')
            
            print_info(f"  Word: '{word}' - Correct: {correct}")
            if comment:
                print_info(f"    Comment: {comment[:80]}...")
            
            valid_items += 1
        else:
            print_error(f"Feedback item {i} missing 'word' field")
    
    if valid_items > 0:
        print_success(f"Validated {valid_items} feedback item(s)")
    
    return True

def test_end_to_end_processing():
    """Run the complete end-to-end processing test"""
    print("\n" + "="*60)
    print("  Vocabulary Essay Analyzer - End-to-End Processing Test")
    print("="*60)
    
    # Get auth token
    print("\n=== Getting Auth Token ===")
    token = get_auth_token()
    if not token:
        print_error("Failed to get auth token. Cannot run test.")
        print("   Set TEST_EMAIL and TEST_PASSWORD environment variables")
        return False
    print_success("Auth token obtained")
    
    # Test essay text (from essay_1.txt)
    test_essay = """Last weekend, our class went on a field trip to the local history museum. I was excited because I like seeing old objects and hearing the stories behind them. When we entered the building, the air smelled like dust and polish. A guide greeted us and led us through several rooms filled with artifacts.

The first room showed tools that people used a hundred years ago. They were made of iron and wood, and some still looked strong enough to work. I liked the part where we got to touch a spinning wheel. It was smooth and heavy.

In the second room, we saw clothes from different decades. Some looked fancy, with shiny buttons and long skirts. Others were plain but neat. I realized that people worked very hard to make what they needed, even without machines.

By the end of the trip, I was tired but happy. I learned that history is not just about dates and battles; it's also about the small things people used every day. When I got home, I told my parents everything I saw, and they promised to take me back next month."""
    
    # Step 1: Upload essay
    upload_result = upload_essay(test_essay, token)
    
    if not upload_result:
        print_error("Failed to upload essay. Aborting test.")
        return False
    
    essay_id = upload_result['essay_id']
    
    # Step 2: Wait for processing
    processed_data = wait_for_processing(essay_id, token)
    
    if not processed_data:
        print_error("Processing did not complete. Aborting test.")
        return False
    
    # Step 3: Validate metrics
    metrics = processed_data.get('metrics')
    metrics_valid = validate_metrics(metrics)
    
    # Step 4: Validate feedback
    feedback = processed_data.get('feedback', [])
    feedback_valid = validate_feedback(feedback)
    
    # Step 5: Print final summary
    print_section("Test Summary")
    
    print(f"Essay ID: {essay_id}")
    print(f"Status: {processed_data.get('status')}")
    print(f"Created: {processed_data.get('created_at')}")
    print(f"Updated: {processed_data.get('updated_at')}")
    
    if metrics_valid and feedback_valid:
        print_success("All validations passed! 🎉")
        print("\nFull response:")
        print(json.dumps(processed_data, indent=2))
        return True
    else:
        print_error("Some validations failed")
        if not metrics_valid:
            print_error("  - Metrics validation failed")
        if not feedback_valid:
            print_error("  - Feedback validation failed")
        return False

def main():
    """Main entry point"""
    try:
        success = test_end_to_end_processing()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print_error("\nTest interrupted by user")
        sys.exit(1)
    except Exception as e:
        print_error(f"Test failed with exception: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()


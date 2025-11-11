# Guide: Creating a Test User for Integration Tests

## Option 1: Cognito Hosted UI (Recommended - Easiest)

The Cognito Hosted UI allows self-service sign-up. This is the easiest method:

1. **Open the Hosted UI URL:**
   ```
   https://vincent-vocab-971422717446.auth.us-east-1.amazonaws.com
   ```

2. **Click "Sign up"** (if available) or use the sign-up link

3. **Fill in the form:**
   - Email: `test-teacher@example.com` (or any email)
   - Password: Must meet requirements:
     - At least 8 characters
     - Contains uppercase letter
     - Contains lowercase letter  
     - Contains number
     - Example: `Test1234!`

4. **Verify email** (if required - check your email for verification code)

5. **Sign in** with your credentials

6. **Use the credentials in tests:**
   ```bash
   export TEST_EMAIL='test-teacher@example.com'
   export TEST_PASSWORD='Test1234!'
   python test_epic7.py
   ```

## Option 2: AWS CLI Script (Quick for Testing)

We've created a script that creates a user programmatically:

```bash
./create_test_user.sh test-teacher@example.com Test1234!
```

**Note:** Users created this way may need to change password on first login. The script handles this automatically.

## Option 3: AWS Console

1. Go to AWS Console → Cognito → User Pools
2. Select `vincent-vocab-teachers-pool`
3. Click "Users" tab
4. Click "Create user"
5. Enter email and temporary password
6. Set password as permanent
7. Mark email as verified

## Option 4: Frontend Registration (Not Yet Implemented)

Currently, the frontend only has a login page. We can add a registration page if needed, but for now, use one of the options above.

## Testing After User Creation

Once you have a user, run the integration tests:

```bash
export TEST_EMAIL='your-email@example.com'
export TEST_PASSWORD='YourPassword123!'
python test_epic7.py
```

Or if you have a JWT token:

```bash
export COGNITO_TOKEN='your-jwt-token-here'
python test_epic7.py
```

## Troubleshooting

If you get "Invalid or expired token" errors:

1. **Check user status:** User must be `CONFIRMED` (not `FORCE_CHANGE_PASSWORD`)
2. **Try Hosted UI login first:** Sometimes logging in via Hosted UI helps activate the user
3. **Check token format:** The token should be an IdToken from Cognito (not AccessToken)
4. **Verify email:** Make sure email is verified in Cognito

## Current Test User

We've already created a test user:
- **Email:** `test-teacher@example.com`
- **Password:** `Test1234!`

However, this user may need to complete the password change flow. Try logging in via the Hosted UI first to activate the account.


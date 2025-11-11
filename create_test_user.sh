#!/bin/bash
# Script to create a test user in Cognito User Pool

USER_POOL_ID="us-east-1_65hpvHpPX"
REGION="us-east-1"
EMAIL="${1:-test@example.com}"
PASSWORD="${2:-Test1234!}"

echo "Creating test user: $EMAIL"
echo "User Pool: $USER_POOL_ID"

# Create user (suppress email verification for testing)
aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --region "$REGION" \
  --username "$EMAIL" \
  --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true \
  --message-action SUPPRESS

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id "$USER_POOL_ID" \
  --region "$REGION" \
  --username "$EMAIL" \
  --password "$PASSWORD" \
  --permanent

echo ""
echo "✅ User created successfully!"
echo "Email: $EMAIL"
echo "Password: $PASSWORD"
echo ""
echo "You can now use these credentials to:"
echo "1. Run integration tests:"
echo "   export TEST_EMAIL='$EMAIL'"
echo "   export TEST_PASSWORD='$PASSWORD'"
echo "   python test_epic7.py"
echo ""
echo "2. Login via frontend or API"


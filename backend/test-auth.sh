#!/bin/bash

# Test script for authentication endpoints
# Usage: ./test-auth.sh

BASE_URL="http://localhost:5001/v1"
TEST_EMAIL="test$(date +%s)@example.com"
TEST_PASSWORD="TestPassword123!"
TEST_NAME="Test User"

echo "🧪 Testing Authentication Endpoints..."
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Signup
echo "1️⃣ Testing Signup..."
SIGNUP_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"name\":\"$TEST_NAME\"}" \
  -c /tmp/auth_cookies.txt)

if echo "$SIGNUP_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Signup successful${NC}"
  ACCESS_TOKEN=$(echo "$SIGNUP_RESPONSE" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
  USER_ID=$(echo "$SIGNUP_RESPONSE" | grep -o '"_id":"[^"]*' | cut -d'"' -f4 | head -1)
  echo "   User ID: $USER_ID"
  echo "   Access Token: ${ACCESS_TOKEN:0:20}..."
else
  echo -e "${RED}❌ Signup failed${NC}"
  echo "$SIGNUP_RESPONSE" | jq '.' 2>/dev/null || echo "$SIGNUP_RESPONSE"
  exit 1
fi

echo ""

# Test 2: Login
echo "2️⃣ Testing Login..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" \
  -c /tmp/auth_cookies.txt)

if echo "$LOGIN_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Login successful${NC}"
  ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
  echo "   Access Token: ${ACCESS_TOKEN:0:20}..."
else
  echo -e "${RED}❌ Login failed${NC}"
  echo "$LOGIN_RESPONSE" | jq '.' 2>/dev/null || echo "$LOGIN_RESPONSE"
  exit 1
fi

echo ""

# Test 3: Get Current User
echo "3️⃣ Testing Get Current User..."
ME_RESPONSE=$(curl -s -X GET "$BASE_URL/auth/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

if echo "$ME_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Get current user successful${NC}"
  USER_NAME=$(echo "$ME_RESPONSE" | grep -o '"name":"[^"]*' | cut -d'"' -f4)
  USER_EMAIL=$(echo "$ME_RESPONSE" | grep -o '"email":"[^"]*' | cut -d'"' -f4)
  echo "   User: $USER_NAME ($USER_EMAIL)"
else
  echo -e "${RED}❌ Get current user failed${NC}"
  echo "$ME_RESPONSE" | jq '.' 2>/dev/null || echo "$ME_RESPONSE"
fi

echo ""

# Test 4: Get Profile
echo "4️⃣ Testing Get Profile..."
PROFILE_RESPONSE=$(curl -s -X GET "$BASE_URL/profile" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

if echo "$PROFILE_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Get profile successful${NC}"
  echo "$PROFILE_RESPONSE" | jq '.data.profile' 2>/dev/null || echo "   Profile data received"
else
  echo -e "${RED}❌ Get profile failed${NC}"
  echo "$PROFILE_RESPONSE" | jq '.' 2>/dev/null || echo "$PROFILE_RESPONSE"
fi

echo ""

# Test 5: Update Profile
echo "5️⃣ Testing Update Profile..."
UPDATE_RESPONSE=$(curl -s -X PUT "$BASE_URL/profile" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "major": "Computer Science",
    "skillLevel": "Intermediate",
    "learningType": "Visual",
    "daysPerWeek": 4,
    "minutesPerSession": 45
  }')

if echo "$UPDATE_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Update profile successful${NC}"
  echo "$UPDATE_RESPONSE" | jq '.data.profile | {major, skillLevel, learningType, daysPerWeek, minutesPerSession}' 2>/dev/null || echo "   Profile updated"
else
  echo -e "${RED}❌ Update profile failed${NC}"
  echo "$UPDATE_RESPONSE" | jq '.' 2>/dev/null || echo "$UPDATE_RESPONSE"
fi

echo ""

# Test 6: Create Session (requires auth)
echo "6️⃣ Testing Create Session (with auth)..."
SESSION_RESPONSE=$(curl -s -X POST "$BASE_URL/sessions" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phase": "pre",
    "mode": "studying",
    "topic": "Test Topic"
  }')

if echo "$SESSION_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Create session successful${NC}"
  SESSION_ID=$(echo "$SESSION_RESPONSE" | grep -o '"id":"[^"]*' | cut -d'"' -f4)
  echo "   Session ID: $SESSION_ID"
else
  echo -e "${RED}❌ Create session failed${NC}"
  echo "$SESSION_RESPONSE" | jq '.' 2>/dev/null || echo "$SESSION_RESPONSE"
fi

echo ""

# Test 7: Access Protected Route Without Token
echo "7️⃣ Testing Protected Route Without Token..."
NO_AUTH_RESPONSE=$(curl -s -X GET "$BASE_URL/auth/me")

if echo "$NO_AUTH_RESPONSE" | grep -q '"code":"AUTH_REQUIRED"'; then
  echo -e "${GREEN}✅ Correctly rejected unauthorized access${NC}"
else
  echo -e "${YELLOW}⚠️ Unexpected response${NC}"
  echo "$NO_AUTH_RESPONSE" | jq '.' 2>/dev/null || echo "$NO_AUTH_RESPONSE"
fi

echo ""

# Test 8: Logout
echo "8️⃣ Testing Logout..."
LOGOUT_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/logout" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -b /tmp/auth_cookies.txt)

if echo "$LOGOUT_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Logout successful${NC}"
else
  echo -e "${YELLOW}⚠️ Logout response:${NC}"
  echo "$LOGOUT_RESPONSE" | jq '.' 2>/dev/null || echo "$LOGOUT_RESPONSE"
fi

echo ""

# Test 9: Access Protected Route After Logout
echo "9️⃣ Testing Protected Route After Logout..."
AFTER_LOGOUT_RESPONSE=$(curl -s -X GET "$BASE_URL/auth/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

if echo "$AFTER_LOGOUT_RESPONSE" | grep -q '"code":"INVALID_TOKEN"\|"code":"AUTH_REQUIRED"'; then
  echo -e "${GREEN}✅ Correctly rejected after logout${NC}"
else
  echo -e "${YELLOW}⚠️ Token may still be valid (check expiration)${NC}"
  echo "$AFTER_LOGOUT_RESPONSE" | jq '.' 2>/dev/null || echo "$AFTER_LOGOUT_RESPONSE"
fi

echo ""
echo -e "${GREEN}✅ All authentication tests completed!${NC}"

# Cleanup
rm -f /tmp/auth_cookies.txt









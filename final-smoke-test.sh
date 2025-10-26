#!/usr/bin/env bash
set -euo pipefail
API="${API:-http://localhost:5001}"

req() { curl -sS "$@"; }
have_jq(){ command -v jq >/dev/null 2>&1; }
(! have_jq) && { echo "Install jq first"; exit 1; }

hr(){ printf "\n%s\n" "===================================="; }

hr; echo "✅ Test 1: Create session"
CREATE=$(req -X POST "$API/v1/sessions" -H 'Content-Type: application/json' -d '{"topic":"Linear Regression"}')
SID=$(echo "$CREATE" | jq -r '.data.id')
echo "Session ID: $SID"

hr; echo "✅ Test 2: Assessment returns clarify or plan"
A1=$(req -X POST "$API/v1/assessment" -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg sid "$SID" '{sessionId:$sid, userMessage:"Machine Learning Basics", mode:"studying"}')")
echo "$A1" | jq .

CLARIFY=$(echo "$A1" | jq -r '.clarify // false')
echo "Assessment returned: clarify=$CLARIFY"

hr; echo "✅ Test 3: Chat guard (should 409 if phase=pre/assessing)"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/v1/chat" -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg sid "$SID" '{sessionId:$sid, userMessage:"hi"}')")
echo "Chat returned: $CODE"
[[ "$CODE" == "409" ]] && echo "✅ Guard working" || echo "⚠️  Expected 409, got $CODE"

hr; echo "✅ Test 4: Illegal phase guard on new session"
NEW_SID=$(req -X POST "$API/v1/sessions" -H 'Content-Type: application/json' -d '{"topic":"Test"}' | jq -r '.data.id')
NEW_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/v1/chat" -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg sid "$NEW_SID" '{sessionId:$sid, userMessage:"hi"}')")
echo "New session chat returned: $NEW_CODE"
[[ "$NEW_CODE" == "409" ]] && echo "✅ Illegal phase guard working" || echo "⚠️  Expected 409, got $NEW_CODE"

hr; echo "🎉 Basic smoke tests complete"
echo "Note: Full assessment→learning flow requires completing clarify→plan loop in UI"


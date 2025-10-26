#!/usr/bin/env bash
set -euo pipefail

# ====== CONFIG ======
API="${API:-http://localhost:5001}"

have_jq() { command -v jq >/dev/null 2>&1; }
if ! have_jq; then
  echo "This script uses 'jq' for JSON checks. Install via 'brew install jq' (mac) or run without checks."
  exit 1
fi

hr() { printf "\n%s\n" "---------------------------------------------"; }

# ====== A) CREATE SESSION ======
hr; echo "A) Creating a new session…"
CREATE_OUT=$(curl -s -X POST "$API/v1/sessions" \
  -H 'Content-Type: application/json' \
  -d '{"topic":"Linear Regression"}')

echo "$CREATE_OUT" | jq .
SESSION=$(echo "$CREATE_OUT" | jq -r '.data.id // .sessionId')
if [[ "$SESSION" == "null" || -z "$SESSION" ]]; then
  echo "❌ Failed to create session."; exit 1
fi
echo "SESSION: $SESSION"

# helper to fetch session state
get_session () { curl -s "$API/v1/sessions/$SESSION"; }

BASE_STATE=$(get_session)
BASE_POINTS=$(echo "$BASE_STATE" | jq -r '.data.points')
BASE_GEMS=$(echo "$BASE_STATE" | jq -r '.data.gems')

# ====== B) ASSESSMENT TEST ======
hr; echo "B) Assessment test (may return clarify or plan depending on topic clarity)…"
ASSESS_RICH=$(curl -s -X POST "$API/v1/assessment" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg sid "$SESSION" '{sessionId:$sid, userMessage:"Machine Learning with Python", mode:"studying"}')")

echo "$ASSESS_RICH" | jq .

# Check if we got a plan or clarification
CLARIFY=$(echo "$ASSESS_RICH" | jq -r '.clarify // false')
if [[ "$CLARIFY" == "true" ]]; then
  echo "✅ Assessment returned clarification questions (expected for some topics)"
  QCOUNT=$(echo "$ASSESS_RICH" | jq '.questions | length')
  if [[ "$QCOUNT" -gt 2 ]]; then
    echo "⚠️  Expected ≤2 questions, got $QCOUNT"
  fi
else
  # We got a plan - validate it
  PLAN_LEN=$(echo "$ASSESS_RICH" | jq '.data.plan | length')
  POINT_SUM=$(echo "$ASSESS_RICH" | jq '[.data.plan[].points] | add')
  NEXT_PHASE=$(echo "$ASSESS_RICH" | jq -r '.data.nextPhase')
  if [[ "$PLAN_LEN" -lt 2 || "$PLAN_LEN" -gt 8 || "$POINT_SUM" -ne 100 || "$NEXT_PHASE" != "learning" ]]; then
    echo "⚠️  Plan validation: len=$PLAN_LEN sum=$POINT_SUM nextPhase=$NEXT_PHASE"
  else
    echo "✅ Assessment returned valid plan (len=$PLAN_LEN, sum=$POINT_SUM, nextPhase=$NEXT_PHASE)."
  fi
fi

# ====== C) ASSESSMENT (SPARSE PROFILE → CLARIFY ≤2 THEN PLAN) ======
hr; echo "C) Creating new session for clarify test…"
CREATE_OUT2=$(curl -s -X POST "$API/v1/sessions" \
  -H 'Content-Type: application/json' \
  -d '{"topic":"Operating Systems"}')
SESSION2=$(echo "$CREATE_OUT2" | jq -r '.data.id')
echo "SESSION2: $SESSION2"

hr; echo "C) Assessment with sparse profile (should ask ≤2 clarifies, then plan)…"
ASSESS_CLARIFY_1=$(curl -s -X POST "$API/v1/assessment" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg sid "$SESSION2" '{sessionId:$sid, userMessage:"Operating Systems"}')")

echo "$ASSESS_CLARIFY_1" | jq .
CLARIFY_1=$(echo "$ASSESS_CLARIFY_1" | jq -r '.clarify // false')
QCOUNT_1=$(echo "$ASSESS_CLARIFY_1" | jq '.questions | length // 0')
if [[ "$CLARIFY_1" != "true" || "$QCOUNT_1" -gt 2 ]]; then
  echo "⚠️  Expected clarify:true with ≤2 questions. clarify=$CLARIFY_1 qcount=$QCOUNT_1"
  echo "Note: AI may generate plan directly if topic is clear enough"
fi
echo "Status: clarify=$CLARIFY_1 qcount=$QCOUNT_1"

# ====== D) CHAT: GENERAL MESSAGE (NEUTRAL; NO STATE MUTATION) ======
hr; echo 'D) /v1/chat with general message "tell me a joke"…'
CHAT_GEN=$(curl -s -X POST "$API/v1/chat" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg sid "$SESSION" '{sessionId:$sid, userMessage:"tell me a joke"}')")

echo "$CHAT_GEN" | jq .
STATE_AFTER_GEN=$(get_session)
POINTS_AFTER_GEN=$(echo "$STATE_AFTER_GEN" | jq -r '.data.points')
GEMS_AFTER_GEN=$(echo "$STATE_AFTER_GEN" | jq -r '.data.gems')

if [[ "$POINTS_AFTER_GEN" != "$BASE_POINTS" ]]; then
  echo "⚠️  General message may have affected progress. points $BASE_POINTS->$POINTS_AFTER_GEN, gems $BASE_GEMS->$GEMS_AFTER_GEN"
else
  echo "✅ General chat did not change points/gems."
fi

# ====== E) CHAT: CONTINUE LESSON (EXPECT MINI-CHECK QUESTION) ======
hr; echo 'E) /v1/chat "continue the lesson" (expect a concrete question)…'
CHAT_LEARN=$(curl -s -X POST "$API/v1/chat" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg sid "$SESSION" '{sessionId:$sid, userMessage:"continue the lesson"}')")

echo "$CHAT_LEARN" | jq .
# crude check: last assistant text contains '?'
HAS_Q=$(echo "$CHAT_LEARN" | jq -r '.data.message // ""' | grep -q '?' && echo "yes" || echo "no")
if [[ "$HAS_Q" != "yes" ]]; then
  echo "⚠️  Teacher reply did not clearly end with a concrete question."
else
  echo "✅ Teacher reply contains a question (mini-check)."
fi

# ====== F) GUARD: ILLEGAL PHASE (brand-new session → chat should 409) ======
hr; echo "F) Illegal phase guard (new PRE session → /v1/chat should 409)…"
NEW_SESSION=$(curl -s -X POST "$API/v1/sessions" -H 'Content-Type: application/json' -d '{"topic":"Any"}' | jq -r '.data.id')
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/v1/chat" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg sid "$NEW_SESSION" '{sessionId:$sid, userMessage:"hi"}')")

echo "HTTP $CODE"
if [[ "$CODE" != "409" ]]; then
  echo "⚠️  Expected 409 ILLEGAL_PHASE on brand-new session, got $CODE"
else
  echo "✅ Guard works (409)."
fi

hr; echo "🎉 SMOKE CHECKS COMPLETED"


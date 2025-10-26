#!/usr/bin/env bash
set -euo pipefail
API="${API:-http://localhost:5001}"

req() { curl -sS "$@"; }
have_jq(){ command -v jq >/dev/null 2>&1; }
(! have_jq) && { echo "Install jq first (brew install jq)"; exit 1; }

hr(){ printf "\n%s\n" "------------------------------------"; }

hr; echo "A) Create session"
CREATE=$(req -X POST "$API/v1/sessions" -H 'Content-Type: application/json' -d '{"topic":"Linear Regression"}')
echo "$CREATE" | jq .
SID=$(echo "$CREATE" | jq -r '.data.id')
test "$SID" != null && test -n "$SID" || { echo "No sessionId"; exit 1; }

get_session(){ req "$API/v1/sessions/$SID"; }
BASE=$(get_session)
BASE_POINTS=$(echo "$BASE" | jq -r '.data.points')
BASE_GEMS=$(echo "$BASE" | jq -r '.data.gems')

hr; echo "B) Assessment turn 1"
A1=$(req -X POST "$API/v1/assessment" -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg sid "$SID" '{sessionId:$sid, userMessage:"Machine Learning with Python", mode:"studying"}')")

echo "$A1" | jq .
CLARIFY=$(echo "$A1" | jq -r '.clarify // false')

if [[ "$CLARIFY" == "true" ]]; then
  hr; echo "C) Auto-answering clarify (≤2)"
  # Build a naive answers object from returned questions
  QLEN=$(echo "$A1" | jq '.questions | length')
  # Just send the answers as text responses
  ANS="Practicing ML fundamentals, interested in neural networks"
  
  A2=$(req -X POST "$API/v1/assessment" -H 'Content-Type: application/json' \
    -d "$(jq -nc --arg sid "$SID" --arg ans "$ANS" '{sessionId:$sid, userMessage:$ans}')")
  echo "$A2" | jq .

  PLAN_LEN=$(echo "$A2" | jq '.data.plan | length')
  SUM=$(echo "$A2" | jq '[.data.plan[].points] | add')
  NEXT=$(echo "$A2" | jq -r '.data.nextPhase')
  [[ "$PLAN_LEN" -ge 2 && "$PLAN_LEN" -le 8 && "$SUM" -eq 100 && "$NEXT" == "learning" ]] \
    || { echo "Plan validation failed after clarify: len=$PLAN_LEN sum=$SUM next=$NEXT"; exit 1; }
  echo "✅ Plan created after clarify: len=$PLAN_LEN sum=$SUM"
else
  PLAN_LEN=$(echo "$A1" | jq '.data.plan | length')
  SUM=$(echo "$A1" | jq '[.data.plan[].points] | add')
  NEXT=$(echo "$A1" | jq -r '.data.nextPhase')
  [[ "$PLAN_LEN" -ge 2 && "$PLAN_LEN" -le 8 && "$SUM" -eq 100 && "$NEXT" == "learning" ]] \
    || { echo "Plan validation failed on first turn: len=$PLAN_LEN sum=$SUM next=$NEXT"; exit 1; }
  echo "✅ Plan created on first turn: len=$PLAN_LEN sum=$SUM"
fi

hr; echo "D) Chat (general) — expect neutral, no state change"
GEN=$(req -X POST "$API/v1/chat" -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg sid "$SID" '{sessionId:$sid, userMessage:"tell me a joke"}')")
echo "$GEN" | jq .

AFTER_GEN=$(get_session)
PTS2=$(echo "$AFTER_GEN" | jq -r '.data.points')
GMS2=$(echo "$AFTER_GEN" | jq -r '.data.gems')
[[ "$PTS2" == "$BASE_POINTS" && "$GMS2" == "$BASE_GEMS" ]] \
  || { echo "General chat mutated state: pts=$BASE_POINTS -> $PTS2"; exit 1; }
echo "✅ General chat did not mutate points/gems"

hr; echo "E) Chat (learning) — expect mini-check question"
LEARN=$(req -X POST "$API/v1/chat" -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg sid "$SID" '{sessionId:$sid, userMessage:"continue the lesson"}')")
echo "$LEARN" | jq .
TXT=$(echo "$LEARN" | jq -r '.data.message // ""')
echo "$TXT" | grep -q '?' || { echo "No concrete question in reply"; exit 1; }
echo "✅ Learning chat contains a question"

hr; echo "F) Guard — new PRE session → /v1/chat should 409"
NEW=$(req -X POST "$API/v1/sessions" -H 'Content-Type: application/json' -d '{"topic":"Any"}' | jq -r '.data.id')
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/v1/chat" -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"$NEW\",\"userMessage\":\"hi\"}")
echo "HTTP $CODE"
[[ "$CODE" == "409" ]] || { echo "Expected 409, got $CODE"; exit 1; }
echo "✅ Illegal phase guard works (409)"

hr; echo "🎉 Smoke test complete"


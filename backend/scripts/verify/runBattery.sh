#!/bin/bash
# Live verification battery. VERIFY_BASE_URL selects the target deployment
# (default: the live iitl service). Each harness is self-contained with full
# teardown; RUN_TS is refreshed per harness so zz_* names never collide.
cd "$(dirname "$0")"
export MONGODB_URI="${MONGODB_URI:-$(gcloud secrets versions access latest --secret=mongodb-uri-iitl --project llm-ed-studyassist)}"
export SIGNUP_SECRET="${SIGNUP_SECRET:-$(gcloud run services describe studyassist-iitl-backend --project llm-ed-studyassist --region us-central1 --format=json | python3 -c "import json,sys; d=json.load(sys.stdin); print({e['name']:e.get('value','') for e in d['spec']['template']['spec']['containers'][0]['env']}.get('INSTRUCTOR_SIGNUP_SECRET',''))")}"
FAILED=0
for t in verifyGrading verifyDirectives verifyProbeRouter briefingSmoke verifyLargeSyllabus verifySimTruncation; do
  echo ""
  echo "################ $t ################"
  export RUN_TS="$(date +%s)"
  node "$t.js" 2>&1
  rc=$?
  echo "#### $t exit: $rc ####"
  [ $rc -ne 0 ] && FAILED=$((FAILED+1))
done
echo ""
echo "================ BATTERY DONE: $FAILED harness(es) failed ================"
exit $FAILED

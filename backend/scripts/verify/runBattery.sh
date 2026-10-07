#!/bin/bash
# Live verification battery. VERIFY_BASE_URL selects the target deployment
# (default: the live iitl service). MANIFEST_DIR points at the directory
# holding the study-manifest-*.json files (untracked; usually the main
# checkout's backend/scripts). Each harness is self-contained with full
# teardown; RUN_TS is refreshed per harness so zz_* names never collide.
cd "$(dirname "$0")"
if [ -z "$MONGODB_URI" ]; then
  MONGODB_URI=$(gcloud secrets versions access latest --secret=mongodb-uri-iitl --project llm-ed-studyassist)
  export MONGODB_URI
fi
if [ -z "$SIGNUP_SECRET" ]; then
  # NOTE: assigned in its own statement — nesting this $() inside a
  # "${VAR:-...}" default mangles the inner double quotes and exports "".
  SIGNUP_SECRET=$(gcloud run services describe studyassist-iitl-backend --project llm-ed-studyassist --region us-central1 --format=json | python3 -c 'import json,sys; d=json.load(sys.stdin); print({e["name"]:e.get("value","") for e in d["spec"]["template"]["spec"]["containers"][0]["env"]}.get("INSTRUCTOR_SIGNUP_SECRET",""))')
  export SIGNUP_SECRET
fi
if [ -z "$SIGNUP_SECRET" ]; then echo "FATAL: SIGNUP_SECRET is empty"; exit 3; fi
export MANIFEST_DIR="${MANIFEST_DIR:-$(cd .. && pwd)}"
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

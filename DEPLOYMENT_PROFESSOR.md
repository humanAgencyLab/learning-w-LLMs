# Deploying Study Assist to the Professor's GCP Project (`llm-ed-studyassist`)

This document is the single source of truth for the parallel deployment of
Study Assist under Dr. Adenuga's Google Cloud project. It assumes Approach A
from the deployment plan: branch-based separation between the
paper-validated student app and the actively evolving instructor app.

| Component | Source branch | GCP project | Cloud Run service | Firebase target | Site ID |
|---|---|---|---|---|---|
| Student backend | `release/first-study` | `llm-ed-studyassist` | `study-assist-backend-prod` | n/a | n/a |
| Student frontend | `release/first-study` | `llm-ed-studyassist` | n/a | `prod` | `studyassist-prod-v2` |
| Instructor backend | `main` | `llm-ed-studyassist` | `studyassist-iitl-backend` | n/a | n/a |
| Instructor frontend | `main` | `llm-ed-studyassist` | n/a | `iitl` | `studyassist-iitl-v2` |

## Prerequisites (one-time, owned by the professor)

The professor needs to complete these three setup tasks before any deploy
will succeed. Steps for her are in the recruitment email titled
"Firebase access for IITL frontend deployment".

1. **Firebase enabled on `llm-ed-studyassist`** with the Blaze (pay-as-you-go)
   billing plan, and Jonayed granted the **Firebase Hosting Admin** role.
2. **MongoDB Atlas project named "StudyAssist"** with a free M0 cluster in
   AWS us-central1 (or nearest), and Jonayed granted **Project Owner** role.
3. **Groq Cloud account** with billing attached, and Jonayed invited to the
   organization with permissions to create API keys.

## Prerequisites (one-time, owned by Jonayed)

After the professor's setup is in place:

### Create the new Firebase Hosting sites

```bash
# In the Firebase console for llm-ed-studyassist, manually:
#   Build -> Hosting -> Add another site -> studyassist-prod-v2
#   Build -> Hosting -> Add another site -> studyassist-iitl-v2
# (Site names can be changed; update .firebaserc to match.)
```

### Create the MongoDB databases and users

Two databases on the new Atlas cluster:

- `studyassist_prod` — restore from the existing Phase 1 production data
  via `mongorestore` if continuity is needed; otherwise leave empty for a
  fresh start.
- `studyassist_iitl` — fresh database for the instructor study.

Create one database user per app with read/write on its own database only.
Capture the connection strings.

### Create Secret Manager secrets on `llm-ed-studyassist`

```bash
PROJECT=llm-ed-studyassist

# Shared Groq key (one key, two backends)
echo -n "<groq-api-key-value>" | \
  gcloud secrets create groq-api-key --data-file=- --project $PROJECT

# Student-deployment secrets
echo -n "mongodb+srv://...@.../studyassist_prod" | \
  gcloud secrets create mongodb-uri-prod --data-file=- --project $PROJECT
echo -n "$(openssl rand -hex 32)" | \
  gcloud secrets create jwt-secret-prod --data-file=- --project $PROJECT
echo -n "https://studyassist-prod-v2.web.app" | \
  gcloud secrets create cors-origins-prod --data-file=- --project $PROJECT

# Instructor-deployment secrets
echo -n "mongodb+srv://...@.../studyassist_iitl" | \
  gcloud secrets create mongodb-uri-iitl --data-file=- --project $PROJECT
echo -n "$(openssl rand -hex 32)" | \
  gcloud secrets create jwt-secret-iitl --data-file=- --project $PROJECT
echo -n "https://studyassist-iitl-v2.web.app" | \
  gcloud secrets create cors-origins-iitl --data-file=- --project $PROJECT
```

Grant the Cloud Run runtime service account access to each secret:

```bash
RUNTIME_SA="$(gcloud projects describe $PROJECT --format='value(projectNumber)')-compute@developer.gserviceaccount.com"

for s in groq-api-key mongodb-uri-prod mongodb-uri-iitl \
         jwt-secret-prod jwt-secret-iitl \
         cors-origins-prod cors-origins-iitl; do
  gcloud secrets add-iam-policy-binding $s \
    --member="serviceAccount:$RUNTIME_SA" \
    --role="roles/secretmanager.secretAccessor" \
    --project $PROJECT
done
```

## Deploy: Student app (Phase 1, paper version)

Build and ship from `release/first-study` so the paper-validated behavior
is preserved.

### Backend

```bash
cd "/path/to/learning-w-LLMs"
git fetch origin
git checkout release/first-study
# Cherry-pick the cloudbuild.prod.yaml if it doesn't exist on this branch:
#   git cherry-pick <commit-on-main-that-added-cloudbuild.prod.yaml>
gcloud builds submit --config backend/cloudbuild.prod.yaml \
  --project llm-ed-studyassist
```

Note the Cloud Run URL the build prints (e.g.
`https://study-assist-backend-prod-xxxxx-uc.a.run.app`). Save it for the
frontend build.

### Frontend

```bash
cd frontend/my-app

# Build with the prod backend URL baked into REACT_APP_API_BASE_URL
REACT_APP_API_BASE_URL=https://study-assist-backend-prod-xxxxx-uc.a.run.app \
  npm run build

cd ../..
firebase deploy --project professor --only hosting:prod
```

Verify: open `https://studyassist-prod-v2.web.app/`, sign up, walk through
a topic, confirm the chat round-trips against the new backend.

## Deploy: Instructor app (Phase 2 / IITL)

Build and ship from `main`, which has the instructor loop on top of the
student loop.

### Backend

```bash
git checkout main
gcloud builds submit --config backend/cloudbuild.iitl.yaml \
  --project llm-ed-studyassist
```

This is the existing config; it deploys to `studyassist-iitl-backend`. Note
the resulting Cloud Run URL.

### Frontend

```bash
cd frontend/my-app

IITL_API_URL=https://studyassist-iitl-backend-xxxxx-uc.a.run.app \
  npm run build:iitl

cd ../..
firebase deploy --project professor --only hosting:iitl
```

Verify: open `https://studyassist-iitl-v2.web.app/`, sign up as instructor,
create a course, generate topic drafts.

## Rolling back

If a deploy goes bad, redeploy the previous artifact:

```bash
# Backend: pick a previous tag from gcloud run revisions list
gcloud run services update-traffic study-assist-backend-prod \
  --to-revisions=study-assist-backend-prod-00007-abc=100 \
  --region us-central1 --project llm-ed-studyassist

# Frontend: redeploy the previous build/ folder, then
firebase deploy --project professor --only hosting:prod
```

## Notes

- The original deployment on `study-assist-prod` (personal GCP project)
  stays untouched. It continues serving `study-assist-prod.web.app`, which
  is the URL referenced in the HCII 2026 paper. Treat that project as a
  read-only backup; do not deploy to it from this branch.
- For any code change that should apply to BOTH deployments, make the
  change on `main`, cherry-pick to `release/first-study`, then redeploy
  both. In practice, code rarely needs to change on the student branch
  after the paper is published.
- The IRB submission (`Phase2_IRB_Submission/`) needs its URL references
  updated from `studyassist-iitl.web.app` to `studyassist-iitl-v2.web.app`
  (or whatever the final site ID ends up being). This is a quick
  find-and-replace once the new site is live.

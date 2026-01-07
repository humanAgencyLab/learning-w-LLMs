# Deployment Checklist

Use this checklist to prepare for deployment to Google Cloud.

## Pre-Deployment Requirements

### 1. Google Cloud Account Setup
- [ ] Create Google Cloud account at https://cloud.google.com
- [ ] Enable billing (you get $300 free credits)
- [ ] Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install
- [ ] Verify installation: `gcloud --version`
- [ ] Login: `gcloud auth login`
- [ ] Create project: `gcloud projects create study-assist-prod`
- [ ] Set project: `gcloud config set project study-assist-prod`

### 2. MongoDB Atlas Setup
- [ ] Create MongoDB Atlas account at https://www.mongodb.com/cloud/atlas
- [ ] Create free M0 cluster
- [ ] Create database user (username/password)
- [ ] Whitelist IP: `0.0.0.0/0` (for Cloud Run)
- [ ] Get connection string (format: `mongodb+srv://user:pass@cluster.mongodb.net/dbname`)

### 3. API Keys & Secrets
- [ ] Get Groq API key from https://console.groq.com
- [ ] Generate JWT secret (can use: `openssl rand -hex 32`)
- [ ] Have MongoDB connection string ready
- [ ] Decide on CORS origins (frontend URL - can update later)

### 4. Local Testing (Recommended)
- [ ] Test backend locally: `cd backend && npm start`
- [ ] Test frontend locally: `cd frontend/my-app && npm start`
- [ ] Verify all functionality works locally

## Deployment Steps

### Step 1: Enable Google Cloud APIs
```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  firebase.googleapis.com
```

### Step 2: Set Up Secrets
Run: `./scripts/setup-secrets.sh`
OR manually create secrets (see DEPLOYMENT_QUICK_START.md)

### Step 3: Deploy Backend
Run: `./scripts/deploy-backend.sh`
OR follow manual steps in DEPLOYMENT_QUICK_START.md

### Step 4: Get Backend URL
```bash
gcloud run services describe study-assist-backend \
  --region us-central1 \
  --format 'value(status.url)'
```

### Step 5: Deploy Frontend
- Initialize Firebase: `firebase init hosting`
- Build: `cd frontend/my-app && npm run build`
- Deploy: `firebase deploy --only hosting`

### Step 6: Update CORS
Update `cors-origins` secret with your Firebase hosting URL

## Post-Deployment Verification

- [ ] Backend health check: `curl https://your-backend-url.run.app/v1/health`
- [ ] Frontend loads correctly
- [ ] Can sign up/login
- [ ] API calls work from frontend
- [ ] Check logs: `gcloud run services logs read study-assist-backend --region us-central1`

## Notes

- All steps require your Google Cloud account credentials
- Secrets are stored securely in Google Secret Manager
- First deployment may take 5-10 minutes
- Free tier covers low-to-moderate traffic
- Monitor costs in Google Cloud Console


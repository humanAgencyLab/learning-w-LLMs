# Deploy Frontend to Firebase Hosting - Step by Step

## Prerequisites

✅ Firebase CLI installed  
✅ Backend deployed and running  
✅ Google Cloud project set up

## Steps

### Step 1: Login to Firebase

Run this command in your terminal (it will open a browser):

```bash
firebase login
```

This will:
- Open your browser
- Ask you to sign in with your Google account
- Authorize Firebase CLI

### Step 2: Initialize Firebase (Already Done!)

The configuration files are already created:
- `firebase.json` - Firebase configuration
- `.firebaserc` - Project settings

### Step 3: Build Frontend

The backend URL is already configured. Build the frontend:

```bash
cd frontend/my-app
npm install  # If you haven't already
npm run build
```

### Step 4: Deploy to Firebase

Option A: Use the deployment script (recommended):
```bash
./scripts/deploy-frontend.sh
```

Option B: Manual deployment:
```bash
cd /path/to/learning-w-LLMs
firebase deploy --only hosting
```

### Step 5: Update CORS Origins

After deployment, get your Firebase hosting URL and update the backend CORS:

```bash
# Get your Firebase URL (usually https://study-assist-prod.web.app)
export FRONTEND_URL="https://study-assist-prod.web.app"

# Update CORS secret
echo -n "$FRONTEND_URL" | gcloud secrets versions add cors-origins --data-file=-

# Update Cloud Run service
gcloud run services update study-assist-backend \
  --update-secrets="CORS_ORIGINS=cors-origins:latest" \
  --region us-central1
```

## Your Site URLs

After deployment:
- **Firebase Hosting**: `https://study-assist-prod.web.app`
- **Backend API**: `https://study-assist-backend-cjlt7bhfta-uc.a.run.app`

## Quick Deploy Command

Once logged in, you can use:

```bash
./scripts/deploy-frontend.sh
```

This script will:
1. Get backend URL automatically
2. Build the frontend
3. Deploy to Firebase
4. Show you the deployed URL


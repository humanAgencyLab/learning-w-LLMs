# Google Cloud Setup Instructions

Google Cloud SDK has been successfully installed! ✅

## Next Steps

Since authentication requires interactive browser login, please run these commands in your terminal:

### Step 1: Authenticate with Google Cloud

```bash
# Make sure gcloud is in your PATH (should already be added to ~/.zshrc)
export PATH="$HOME/google-cloud-sdk/bin:$PATH"

# Login to Google Cloud (this will open a browser)
gcloud auth login
```

This will:
- Open your browser
- Ask you to sign in with your Google account
- Request permissions for Google Cloud
- Complete authentication

### Step 2: Create a Google Cloud Project

```bash
# Create a new project (choose a unique project ID)
gcloud projects create study-assist-prod --name="Study Assist Production"

# Set it as your default project
gcloud config set project study-assist-prod

# Enable billing (you'll need to do this in the Google Cloud Console)
# Go to: https://console.cloud.google.com/billing
# Link a billing account to your project (you get $300 free credits)
```

**Important**: You must enable billing to use Cloud Run and other services.

### Step 3: Enable Required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  firebase.googleapis.com
```

### Step 4: Set Up MongoDB Atlas

1. Go to https://www.mongodb.com/cloud/atlas
2. Create a free account
3. Create a free M0 cluster
4. Create a database user (username/password)
5. Whitelist IP addresses: Add `0.0.0.0/0` (allows Cloud Run to connect)
6. Get your connection string (format: `mongodb+srv://user:pass@cluster.mongodb.net/dbname`)

### Step 5: Set Up Secrets

Run the setup script:

```bash
./scripts/setup-secrets.sh
```

Or manually create secrets:

```bash
export PROJECT_ID=$(gcloud config get-value project)
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
export SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Create secrets (replace with your actual values)
echo -n "your-groq-api-key-here" | gcloud secrets create groq-api-key --data-file=-
echo -n "mongodb+srv://user:pass@cluster.mongodb.net/studyassist" | gcloud secrets create mongodb-uri --data-file=-
echo -n "$(openssl rand -hex 32)" | gcloud secrets create jwt-secret --data-file=-
echo -n "https://your-frontend-domain.com" | gcloud secrets create cors-origins --data-file=-

# Grant access to service account
for secret in groq-api-key mongodb-uri jwt-secret cors-origins; do
  gcloud secrets add-iam-policy-binding $secret \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor"
done
```

### Step 6: Deploy Backend

```bash
./scripts/deploy-backend.sh
```

This will:
- Build the Docker container
- Push it to Google Container Registry
- Deploy to Cloud Run
- Configure secrets and environment variables

### Step 7: Get Backend URL

```bash
gcloud run services describe study-assist-backend \
  --region us-central1 \
  --format 'value(status.url)'
```

Save this URL - you'll need it for the frontend!

### Step 8: Deploy Frontend

```bash
# Install Firebase CLI (if not already installed)
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase (in project root)
firebase init hosting
# Select: existing project, public directory: frontend/my-app/build, single-page app: Yes

# Build frontend with backend URL
cd frontend/my-app
echo "REACT_APP_API_BASE_URL=https://your-backend-url.run.app" > .env.production
npm install
npm run build

# Deploy
cd ../..
firebase deploy --only hosting
```

### Step 9: Update CORS Origins

After getting your Firebase hosting URL:

```bash
# Update CORS secret with your Firebase URL
echo -n "https://your-project-id.web.app" | gcloud secrets versions add cors-origins --data-file=-

# Update Cloud Run service
gcloud run services update study-assist-backend \
  --update-secrets="CORS_ORIGINS=cors-origins:latest" \
  --region us-central1
```

## Verification

Test your deployment:

```bash
# Backend health check
curl https://your-backend-url.run.app/v1/health

# View backend logs
gcloud run services logs read study-assist-backend --region us-central1 --limit 50
```

## Need Help?

- See [GCP_DEPLOYMENT_GUIDE.md](./GCP_DEPLOYMENT_GUIDE.md) for detailed information
- See [DEPLOYMENT_QUICK_START.md](./DEPLOYMENT_QUICK_START.md) for quick reference
- Check logs: `gcloud run services logs read study-assist-backend --region us-central1`

## Important Notes

1. **Billing**: Enable billing in Google Cloud Console before deploying
2. **Free Tier**: Most services have generous free tiers, but monitor usage
3. **Secrets**: Never commit secrets to git - they're stored securely in Secret Manager
4. **CORS**: Make sure to update CORS origins after deploying frontend
5. **MongoDB**: Use MongoDB Atlas free tier (M0 cluster)


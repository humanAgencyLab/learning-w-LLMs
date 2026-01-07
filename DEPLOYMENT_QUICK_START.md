# Quick Start: Deploy to Google Cloud

This is a condensed version of the deployment guide. For detailed information, see [GCP_DEPLOYMENT_GUIDE.md](./GCP_DEPLOYMENT_GUIDE.md).

## Prerequisites Checklist

- [ ] Google Cloud account with billing enabled
- [ ] MongoDB Atlas account (free tier is fine)
- [ ] Google Cloud SDK installed (`gcloud` command)
- [ ] Docker installed (optional, for local testing)

## Quick Deployment Steps

### 1. Initialize Google Cloud Project

```bash
# Login and create project
gcloud auth login
gcloud projects create study-assist-prod --name="Study Assist Production"
gcloud config set project study-assist-prod

# Enable APIs
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com firebase.googleapis.com
```

### 2. Set Up MongoDB Atlas

1. Create account at https://www.mongodb.com/cloud/atlas
2. Create free M0 cluster
3. Create database user
4. Whitelist IP: `0.0.0.0/0` (for Cloud Run)
5. Get connection string (looks like: `mongodb+srv://user:pass@cluster.mongodb.net/dbname`)

### 3. Configure Secrets

Run the setup script:

```bash
./scripts/setup-secrets.sh
```

Or manually create secrets:

```bash
export PROJECT_ID=$(gcloud config get-value project)
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
export SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Create secrets (replace values with your actual data)
echo -n "your-groq-api-key" | gcloud secrets create groq-api-key --data-file=-
echo -n "mongodb+srv://..." | gcloud secrets create mongodb-uri --data-file=-
echo -n "your-jwt-secret" | gcloud secrets create jwt-secret --data-file=-
echo -n "https://your-domain.com" | gcloud secrets create cors-origins --data-file=-

# Grant access
for secret in groq-api-key mongodb-uri jwt-secret cors-origins; do
  gcloud secrets add-iam-policy-binding $secret \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor"
done
```

### 4. Deploy Backend

**Option A: Using deployment script (recommended)**

```bash
./scripts/deploy-backend.sh
```

**Option B: Manual deployment**

```bash
cd backend
export PROJECT_ID=$(gcloud config get-value project)

# Build and deploy
gcloud builds submit --tag gcr.io/$PROJECT_ID/study-assist-backend

gcloud run deploy study-assist-backend \
  --image gcr.io/$PROJECT_ID/study-assist-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=production,LLM_PROVIDER=groq,LLM_MODEL=llama3.1,TRUST_PROXY=1" \
  --set-secrets="GROQ_API_KEY=groq-api-key:latest,MONGODB_URI=mongodb-uri:latest,JWT_SECRET=jwt-secret:latest,CORS_ORIGINS=cors-origins:latest" \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --max-instances 10
```

Get your backend URL:

```bash
gcloud run services describe study-assist-backend --region us-central1 --format 'value(status.url)'
```

### 5. Deploy Frontend

```bash
# Install Firebase CLI (if not already installed)
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase (in project root)
firebase init hosting
# Select: existing project, public directory: frontend/my-app/build, single-page app: Yes

# Build frontend
cd frontend/my-app

# Create .env.production with your backend URL
echo "REACT_APP_API_BASE_URL=https://your-backend-url.run.app" > .env.production

# Install dependencies and build
npm install
npm run build

# Deploy
cd ../..
firebase deploy --only hosting
```

### 6. Update CORS Origins

After getting your Firebase hosting URL, update the CORS secret:

```bash
# Get your Firebase URL (usually https://your-project-id.web.app)
echo -n "https://your-project-id.web.app" | gcloud secrets versions add cors-origins --data-file=-

# Update Cloud Run service
gcloud run services update study-assist-backend \
  --update-secrets="CORS_ORIGINS=cors-origins:latest" \
  --region us-central1
```

## Verify Deployment

```bash
# Check backend health
curl https://your-backend-url.run.app/v1/health

# View backend logs
gcloud run services logs read study-assist-backend --region us-central1

# Visit your frontend URL
# Usually: https://your-project-id.web.app
```

## Common Issues

**Backend won't start:**
- Check logs: `gcloud run services logs read study-assist-backend --region us-central1`
- Verify secrets are set correctly
- Check MongoDB connection string format

**CORS errors:**
- Make sure `cors-origins` secret includes your frontend URL exactly (including `https://`)
- Update Cloud Run service after changing the secret

**MongoDB connection fails:**
- Verify IP whitelist in MongoDB Atlas includes `0.0.0.0/0`
- Check connection string format
- Verify database user credentials

## Next Steps

- Set up custom domain (see full guide)
- Configure monitoring and alerts
- Set up CI/CD with Cloud Build
- Review security best practices

For detailed information, see [GCP_DEPLOYMENT_GUIDE.md](./GCP_DEPLOYMENT_GUIDE.md).


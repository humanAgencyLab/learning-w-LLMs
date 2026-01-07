# Google Cloud Platform Deployment Guide

This guide walks you through deploying the Study Assist application to Google Cloud Platform.

## Architecture Overview

- **Backend API**: Google Cloud Run (containerized Node.js/Express)
- **Frontend**: Firebase Hosting (React static site)
- **Database**: MongoDB Atlas (managed MongoDB)
- **Secrets**: Google Secret Manager
- **CI/CD**: Cloud Build
- **Domain/DNS**: Cloud DNS (optional)

## Prerequisites

1. **Google Cloud Account**
   - Create account at https://cloud.google.com
   - Enable billing (you get $300 free credits)
   - Install [Google Cloud SDK](https://cloud.google.com/sdk/docs/install)

2. **MongoDB Atlas Account**
   - Create free account at https://www.mongodb.com/cloud/atlas
   - Set up a free cluster (M0)

3. **Required Tools**
   ```bash
   # Install Google Cloud CLI
   gcloud --version

   # Install Docker (for local testing)
   docker --version
   ```

## Step 1: Set Up Google Cloud Project

```bash
# Login to Google Cloud
gcloud auth login

# Create a new project (or use existing)
gcloud projects create study-assist-prod --name="Study Assist Production"

# Set as default project
gcloud config set project study-assist-prod

# Enable required APIs
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com

# Enable Firebase (for hosting)
gcloud services enable firebase.googleapis.com
```

## Step 2: Set Up MongoDB Atlas

1. **Create MongoDB Atlas Cluster**
   - Go to https://cloud.mongodb.com
   - Create a new project
   - Create a free M0 cluster (choose a region close to your GCP region)
   - Create database user (username/password)
   - Whitelist IP addresses:
     - Add `0.0.0.0/0` for Cloud Run (or specific IPs for security)

2. **Get Connection String**
   - Click "Connect" on your cluster
   - Choose "Connect your application"
   - Copy the connection string (looks like: `mongodb+srv://user:password@cluster.mongodb.net/dbname?retryWrites=true&w=majority`)

## Step 3: Configure Secrets in Secret Manager

Store sensitive environment variables in Google Secret Manager:

```bash
# Set your project
export PROJECT_ID=$(gcloud config get-value project)

# Create secrets
echo -n "your-groq-api-key-here" | gcloud secrets create groq-api-key --data-file=-
echo -n "mongodb+srv://user:password@cluster.mongodb.net/studyassist" | gcloud secrets create mongodb-uri --data-file=-
echo -n "your-jwt-secret-here" | gcloud secrets create jwt-secret --data-file=-
echo -n "https://your-frontend-domain.com" | gcloud secrets create cors-origins --data-file=-

# Grant Cloud Run service account access to secrets
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
export SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud secrets add-iam-policy-binding groq-api-key \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding mongodb-uri \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding jwt-secret \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"
```

## Step 4: Build and Deploy Backend to Cloud Run

### Option A: Deploy from Local Machine

```bash
# Navigate to backend directory
cd backend

# Build container image
gcloud builds submit --tag gcr.io/$PROJECT_ID/study-assist-backend

# Deploy to Cloud Run
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
  --max-instances 10 \
  --min-instances 0
```

### Option B: Use Cloud Build (Recommended)

See the `cloudbuild.yaml` file for automated builds. Deploy using:

```bash
gcloud builds submit --config cloudbuild.yaml
```

**Note**: You'll need to update the Cloud Run service after first deployment to add secrets (Cloud Build doesn't support secrets in the YAML file). Use the command from Option A after the first build.

## Step 5: Deploy Frontend to Firebase Hosting

### 5.1 Initialize Firebase

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase in your project root
cd /path/to/learning-w-LLMs
firebase init hosting

# Select options:
# - Use existing project: study-assist-prod
# - Public directory: frontend/my-app/build
# - Single-page app: Yes
# - Set up automatic builds: No (we'll do this manually)
```

### 5.2 Update Frontend Environment Variables

Create `frontend/my-app/.env.production`:

```env
REACT_APP_API_BASE_URL=https://your-cloud-run-url.run.app
```

Update `frontend/my-app/src` to use this environment variable for API calls.

### 5.3 Build and Deploy Frontend

```bash
# Navigate to frontend
cd frontend/my-app

# Install dependencies
npm install

# Build for production
npm run build

# Deploy to Firebase
cd ../..
firebase deploy --only hosting
```

### 5.4 Update CORS Origins

After deploying, update the `cors-origins` secret with your Firebase hosting URL:

```bash
# Get your Firebase hosting URL (usually https://your-project-id.web.app)
echo -n "https://your-project-id.web.app" | gcloud secrets versions add cors-origins --data-file=-

# Update Cloud Run service to use new secret version
gcloud run services update study-assist-backend \
  --update-secrets="CORS_ORIGINS=cors-origins:latest" \
  --region us-central1
```

## Step 6: Set Up Continuous Deployment (Optional)

### 6.1 Create Cloud Build Trigger

1. Go to Cloud Build > Triggers in Google Cloud Console
2. Create a new trigger
3. Connect your GitHub repository
4. Configure:
   - **Name**: `deploy-backend`
   - **Event**: Push to branch `main`
   - **Configuration**: Cloud Build configuration file
   - **Location**: `backend/cloudbuild.yaml`

### 6.2 Create Frontend Build Script

Create a separate trigger for the frontend or add it to the same workflow.

## Step 7: Configure Custom Domain (Optional)

### 7.1 Backend (Cloud Run)

```bash
# Map custom domain to Cloud Run service
gcloud run domain-mappings create \
  --service study-assist-backend \
  --domain api.yourdomain.com \
  --region us-central1

# Follow instructions to update DNS records
```

### 7.2 Frontend (Firebase Hosting)

```bash
# Add custom domain in Firebase Console
# Go to Firebase Console > Hosting > Add custom domain
# Follow instructions to verify ownership and update DNS
```

## Step 8: Monitor and Logging

### View Logs

```bash
# Backend logs
gcloud run services logs read study-assist-backend --region us-central1

# Real-time logs
gcloud run services logs tail study-assist-backend --region us-central1
```

### Set Up Monitoring

1. Go to Cloud Console > Monitoring
2. Create alerting policies for:
   - High error rates
   - High latency
   - Cloud Run service errors
   - Secret access failures

## Step 9: Environment Variables Reference

### Required Environment Variables

| Variable | Source | Description |
|----------|--------|-------------|
| `GROQ_API_KEY` | Secret Manager | Groq API key for LLM |
| `MONGODB_URI` | Secret Manager | MongoDB Atlas connection string |
| `JWT_SECRET` | Secret Manager | Secret for JWT token signing |
| `CORS_ORIGINS` | Secret Manager | Allowed CORS origins (comma-separated) |
| `NODE_ENV` | Env var | Set to `production` |
| `LLM_PROVIDER` | Env var | Set to `groq` |
| `LLM_MODEL` | Env var | Set to `llama3.1` |
| `TRUST_PROXY` | Env var | Set to `1` for Cloud Run |
| `PORT` | Auto-set | Cloud Run sets this automatically |

### Optional Environment Variables

- `JWT_ACCESS_EXPIRES_IN`: JWT access token expiration (default: `2h`)
- `JWT_REFRESH_EXPIRES_IN`: JWT refresh token expiration (default: `7d`)

## Troubleshooting

### Backend Issues

**Issue**: Service won't start
```bash
# Check logs
gcloud run services logs read study-assist-backend --region us-central1 --limit 50

# Verify secrets are accessible
gcloud run services describe study-assist-backend --region us-central1
```

**Issue**: MongoDB connection fails
- Verify MongoDB Atlas IP whitelist includes Cloud Run IPs
- Check connection string format
- Verify database user credentials

**Issue**: CORS errors
- Verify `CORS_ORIGINS` secret includes your frontend URL
- Check that URL matches exactly (including https://)

### Frontend Issues

**Issue**: API calls fail
- Verify `REACT_APP_API_BASE_URL` is set correctly
- Check browser console for CORS errors
- Verify backend URL is correct

**Issue**: Build fails
- Clear `node_modules` and rebuild: `rm -rf node_modules package-lock.json && npm install`
- Check Node.js version (requires v18+)

## Cost Estimation

### Free Tier Limits
- **Cloud Run**: 2 million requests/month, 400,000 GB-seconds, 200,000 CPU-seconds
- **Firebase Hosting**: 10 GB storage, 360 MB/day transfer
- **Secret Manager**: 6 secrets, 10,000 access operations/month
- **Cloud Build**: 120 build-minutes/day

### Expected Monthly Costs (Low Traffic)
- **Cloud Run**: $0-5 (if within free tier)
- **Firebase Hosting**: $0 (within free tier)
- **MongoDB Atlas**: $0 (M0 free tier)
- **Secret Manager**: $0 (within free tier)
- **Total**: ~$0-10/month for low traffic

## Security Best Practices

1. **Secrets Management**
   - Never commit secrets to git
   - Use Secret Manager for all sensitive data
   - Rotate secrets regularly

2. **Network Security**
   - Use HTTPS only (enforced by Cloud Run and Firebase)
   - Configure MongoDB Atlas IP whitelist properly
   - Use VPC connector for private connectivity (advanced)

3. **Authentication**
   - Use strong JWT secrets
   - Implement rate limiting (already in code)
   - Monitor for suspicious activity

4. **Monitoring**
   - Set up alerting for errors
   - Monitor API usage
   - Track authentication failures

## Next Steps

1. Set up monitoring and alerting
2. Configure auto-scaling policies
3. Set up staging environment
4. Implement CI/CD pipelines
5. Add custom domains
6. Set up backup strategies for MongoDB
7. Configure CDN for static assets (Firebase Hosting includes this)

## Additional Resources

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Firebase Hosting Documentation](https://firebase.google.com/docs/hosting)
- [Secret Manager Documentation](https://cloud.google.com/secret-manager/docs)
- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/)
- [Cloud Build Documentation](https://cloud.google.com/build/docs)


# Cloud Deployment Troubleshooting Guide

## Overview
This guide helps debug issues when your application works locally but fails in the cloud.

## Quick Status Check

### Backend Status
```bash
# Check backend health
curl https://study-assist-backend-cjlt7bhfta-uc.a.run.app/v1/health

# Check backend readiness (includes MongoDB)
curl https://study-assist-backend-cjlt7bhfta-uc.a.run.app/v1/ready
```

### Frontend Status
- URL: https://study-assist-prod.web.app
- Should connect to backend automatically

## Common Issues & Solutions

### 1. Frontend Not Connecting to Backend

**Symptom:** Frontend shows "Failed to fetch" or "Network error"

**Check:**
```bash
# Verify frontend .env.production file
cat frontend/my-app/.env.production

# Should contain:
REACT_APP_API_BASE_URL=https://study-assist-backend-cjlt7bhfta-uc.a.run.app
```

**Fix:**
1. Update `.env.production` with correct backend URL
2. Rebuild frontend: `cd frontend/my-app && npm run build`
3. Redeploy: `firebase deploy --only hosting`

### 2. CORS Errors

**Symptom:** Browser console shows "Access-Control-Allow-Origin" errors

**Check:**
```bash
# Test CORS preflight
curl -X OPTIONS https://study-assist-backend-cjlt7bhfta-uc.a.run.app/v1/auth/signup \
  -H "Origin: https://study-assist-prod.web.app" \
  -H "Access-Control-Request-Method: POST" \
  -v
```

**Fix:**
1. Hard refresh browser (Cmd+Shift+R / Ctrl+Shift+R)
2. Clear browser cache
3. Try incognito/private window
4. Backend CORS is already configured correctly

### 3. MongoDB Connection Errors

**Symptom:** Backend logs show "bad auth : authentication failed"

**Check:**
1. MongoDB Atlas → Network Access → IP Access List
2. Should have `0.0.0.0/0` whitelisted (allows all IPs)
3. Verify MongoDB credentials in Secret Manager

**Fix:**
```bash
# Update MongoDB URI secret if needed
MONGODB_URI="mongodb+srv://USERNAME:PASSWORD%23@cluster.mongodb.net/?appName=ClusterM0"
echo -n "$MONGODB_URI" | gcloud secrets versions add mongodb-uri --data-file=-
gcloud run services update study-assist-backend \
  --update-secrets="MONGODB_URI=mongodb-uri:latest" \
  --region us-central1
```

### 4. Environment Variables Not Set

**Symptom:** Backend crashes or returns errors about missing variables

**Check:**
```bash
# List all secrets
gcloud secrets list

# Verify secrets are attached to Cloud Run
gcloud run services describe study-assist-backend \
  --region us-central1 \
  --format="get(spec.template.spec.containers[0].env)"
```

**Required Secrets:**
- `groq-api-key`
- `mongodb-uri`
- `jwt-secret`
- `cors-origins`

### 5. Port Configuration

**Symptom:** Backend not responding

**Check:**
- Cloud Run automatically sets `PORT` environment variable
- Backend code uses: `const PORT = process.env.PORT || 5001`
- This is correct - no action needed

### 6. Cold Start Issues

**Symptom:** First request fails, subsequent requests work

**Explanation:**
- Cloud Run scales to zero when idle
- First request after idle period takes 10-30 seconds
- This is normal behavior

**Fix:**
- Wait 30 seconds after first request
- Consider setting minimum instances to 1 if needed:
```bash
gcloud run services update study-assist-backend \
  --min-instances=1 \
  --region us-central1
```

## Environment Comparison

### Local (.env file)
```env
PORT=5001
MONGODB_URI=mongodb+srv://...
GROQ_API_KEY=...
JWT_SECRET=...
CORS_ORIGINS=http://localhost:3000
NODE_ENV=development
```

### Cloud (Secret Manager)
- `PORT`: Set automatically by Cloud Run (8080)
- `MONGODB_URI`: Stored in `mongodb-uri` secret
- `GROQ_API_KEY`: Stored in `groq-api-key` secret
- `JWT_SECRET`: Stored in `jwt-secret` secret
- `CORS_ORIGINS`: Stored in `cors-origins` secret (should be `https://study-assist-prod.web.app`)
- `NODE_ENV`: Set to `production` in Cloud Run

## Debugging Steps

1. **Check Backend Logs:**
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=study-assist-backend" \
  --limit 50 \
  --format="value(timestamp,textPayload)" \
  --project study-assist-prod \
  --freshness=30m
```

2. **Test Backend Directly:**
```bash
# Health check
curl https://study-assist-backend-cjlt7bhfta-uc.a.run.app/v1/health

# Test signup
curl -X POST https://study-assist-backend-cjlt7bhfta-uc.a.run.app/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123456!","name":"Test User"}'
```

3. **Check Frontend Build:**
```bash
cd frontend/my-app
npm run build
# Check build output for errors
```

4. **Verify Frontend Deployment:**
```bash
firebase deploy --only hosting
# Check Firebase console for deployment status
```

## Quick Fixes

### If Backend is Down:
```bash
# Redeploy backend
cd backend
gcloud builds submit --tag gcr.io/study-assist-prod/study-assist-backend --region us-central1
gcloud run deploy study-assist-backend \
  --image gcr.io/study-assist-prod/study-assist-backend \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated
```

### If Frontend is Down:
```bash
cd frontend/my-app
npm run build
firebase deploy --only hosting
```

### If CORS Errors Persist:
1. Hard refresh browser
2. Clear browser cache
3. Check backend CORS configuration (already correct)
4. Verify frontend URL matches CORS_ORIGINS secret

## Getting Help

If issues persist:
1. Check browser console for specific error messages
2. Check backend logs (see Debugging Steps above)
3. Verify all environment variables are set correctly
4. Test backend endpoints directly with curl

## Current Configuration

- **Backend URL:** https://study-assist-backend-cjlt7bhfta-uc.a.run.app
- **Frontend URL:** https://study-assist-prod.web.app
- **MongoDB:** Atlas cluster (ClusterM0)
- **Project:** study-assist-prod


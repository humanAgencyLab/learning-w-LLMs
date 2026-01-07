#!/bin/bash

# Deployment script for Study Assist Backend to Google Cloud Run
# Usage: ./scripts/deploy-backend.sh [environment]
# Example: ./scripts/deploy-backend.sh production

set -e  # Exit on error

ENVIRONMENT=${1:-production}
PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"
SERVICE_NAME="study-assist-backend"

if [ -z "$PROJECT_ID" ]; then
    echo "❌ Error: No Google Cloud project set"
    echo "Run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo "🚀 Deploying Study Assist Backend to Google Cloud Run"
echo "📦 Project: $PROJECT_ID"
echo "🌍 Region: $REGION"
echo "🏷️  Environment: $ENVIRONMENT"
echo ""

# Build and submit the container image
echo "📦 Building container image..."
gcloud builds submit \
    --tag gcr.io/$PROJECT_ID/$SERVICE_NAME:latest \
    --tag gcr.io/$PROJECT_ID/$SERVICE_NAME:$(date +%Y%m%d-%H%M%S) \
    backend/

# Deploy to Cloud Run
echo "🚀 Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
    --image gcr.io/$PROJECT_ID/$SERVICE_NAME:latest \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --set-env-vars="NODE_ENV=production,LLM_PROVIDER=groq,LLM_MODEL=llama3.1,TRUST_PROXY=1" \
    --set-secrets="GROQ_API_KEY=groq-api-key:latest,MONGODB_URI=mongodb-uri:latest,JWT_SECRET=jwt-secret:latest,CORS_ORIGINS=cors-origins:latest" \
    --memory 2Gi \
    --cpu 2 \
    --timeout 300 \
    --max-instances 10 \
    --min-instances 0

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)')

echo ""
echo "✅ Deployment complete!"
echo "🌐 Service URL: $SERVICE_URL"
echo "📊 View logs: gcloud run services logs read $SERVICE_NAME --region $REGION"
echo "🔍 Health check: $SERVICE_URL/v1/health"


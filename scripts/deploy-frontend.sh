#!/bin/bash

# Deployment script for Study Assist Frontend to Firebase Hosting
# Usage: ./scripts/deploy-frontend.sh

set -e  # Exit on error

export PATH="$HOME/google-cloud-sdk/bin:$PATH"

echo "🚀 Deploying Study Assist Frontend to Firebase Hosting"
echo ""

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Installing..."
    npm install -g firebase-tools
fi

# Get backend URL
PROJECT_ID=$(gcloud config get-value project)
BACKEND_URL=$(gcloud run services describe study-assist-backend --region us-central1 --format='value(status.url)' 2>&1)

if [ -z "$BACKEND_URL" ] || [[ "$BACKEND_URL" == *"ERROR"* ]]; then
    echo "❌ Error: Could not get backend URL"
    exit 1
fi

echo "✅ Backend URL: $BACKEND_URL"
echo "✅ Project: $PROJECT_ID"
echo ""

# Navigate to project root
cd "$(dirname "$0")/.."

# Check if Firebase is logged in
if ! firebase projects:list &> /dev/null; then
    echo "⚠️  Please login to Firebase first:"
    echo "   firebase login"
    echo ""
    echo "Then run this script again."
    exit 1
fi

# Set backend URL in frontend
echo "📝 Setting backend URL in frontend..."
cd frontend/my-app
echo "REACT_APP_API_BASE_URL=$BACKEND_URL" > .env.production
echo "✅ Created .env.production"

# Build frontend
echo ""
echo "📦 Building frontend..."
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

npm run build

if [ ! -d "build" ]; then
    echo "❌ Build failed - build directory not found"
    exit 1
fi

echo "✅ Build complete"
echo ""

# Deploy to Firebase
cd ../..
echo "🚀 Deploying to Firebase Hosting..."
firebase deploy --only hosting

# Get the deployed URL
DEPLOYED_URL=$(firebase hosting:sites:list --json 2>/dev/null | grep -o '"defaultUrl":"[^"]*' | head -1 | cut -d'"' -f4 || echo "Check Firebase Console")

echo ""
echo "✅ Deployment complete!"
echo "🌐 Frontend URL: https://$PROJECT_ID.web.app"
echo "   (or check Firebase Console for custom domain)"
echo ""
echo "📋 Next step: Update CORS origins in backend:"
echo "   echo -n 'https://$PROJECT_ID.web.app' | gcloud secrets versions add cors-origins --data-file=-"
echo "   gcloud run services update study-assist-backend \\"
echo "     --update-secrets='CORS_ORIGINS=cors-origins:latest' \\"
echo "     --region us-central1"


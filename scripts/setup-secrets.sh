#!/bin/bash

# Script to set up secrets in Google Secret Manager
# Usage: ./scripts/setup-secrets.sh

set -e  # Exit on error

PROJECT_ID=$(gcloud config get-value project)

if [ -z "$PROJECT_ID" ]; then
    echo "❌ Error: No Google Cloud project set"
    echo "Run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo "🔐 Setting up secrets in Google Secret Manager"
echo "📦 Project: $PROJECT_ID"
echo ""

# Get service account
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "📝 Please enter the following secrets (or press Enter to skip and set later):"
echo ""

# Groq API Key
read -p "Groq API Key: " GROQ_KEY
if [ ! -z "$GROQ_KEY" ]; then
    echo -n "$GROQ_KEY" | gcloud secrets create groq-api-key --data-file=- 2>/dev/null || \
    echo -n "$GROQ_KEY" | gcloud secrets versions add groq-api-key --data-file=-
    echo "✅ Groq API key saved"
fi

# MongoDB URI
read -p "MongoDB URI: " MONGODB_URI
if [ ! -z "$MONGODB_URI" ]; then
    echo -n "$MONGODB_URI" | gcloud secrets create mongodb-uri --data-file=- 2>/dev/null || \
    echo -n "$MONGODB_URI" | gcloud secrets versions add mongodb-uri --data-file=-
    echo "✅ MongoDB URI saved"
fi

# JWT Secret
read -p "JWT Secret (or press Enter to generate): " JWT_SECRET
if [ -z "$JWT_SECRET" ]; then
    JWT_SECRET=$(openssl rand -hex 32)
    echo "Generated JWT Secret: $JWT_SECRET"
fi
echo -n "$JWT_SECRET" | gcloud secrets create jwt-secret --data-file=- 2>/dev/null || \
echo -n "$JWT_SECRET" | gcloud secrets versions add jwt-secret --data-file=-
echo "✅ JWT Secret saved"

# CORS Origins (can be updated later with frontend URL)
read -p "CORS Origins (comma-separated, e.g., https://yourdomain.com): " CORS_ORIGINS
if [ ! -z "$CORS_ORIGINS" ]; then
    echo -n "$CORS_ORIGINS" | gcloud secrets create cors-origins --data-file=- 2>/dev/null || \
    echo -n "$CORS_ORIGINS" | gcloud secrets versions add cors-origins --data-file=-
    echo "✅ CORS Origins saved"
fi

# Grant service account access to secrets
echo ""
echo "🔑 Granting service account access to secrets..."

for secret in groq-api-key mongodb-uri jwt-secret cors-origins; do
    gcloud secrets add-iam-policy-binding $secret \
        --member="serviceAccount:${SERVICE_ACCOUNT}" \
        --role="roles/secretmanager.secretAccessor" 2>/dev/null || \
    echo "⚠️  Secret $secret policy already exists or secret doesn't exist"
done

echo ""
echo "✅ Secrets setup complete!"
echo ""
echo "📋 To update secrets later, use:"
echo "   echo -n 'value' | gcloud secrets versions add SECRET_NAME --data-file=-"
echo ""
echo "📋 To view secrets:"
echo "   gcloud secrets versions access latest --secret=SECRET_NAME"


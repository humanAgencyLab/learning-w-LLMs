#!/bin/bash

# Script to set up secrets in Google Secret Manager using environment variables
# Usage: 
#   export GROQ_API_KEY="your-key"
#   export MONGODB_URI="mongodb+srv://..."
#   export JWT_SECRET="your-secret"  # Optional, will generate if not set
#   export CORS_ORIGINS="https://yourdomain.com"  # Optional
#   ./scripts/setup-secrets-env.sh

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

echo "🔑 Granting service account access..."
echo "Service Account: $SERVICE_ACCOUNT"
echo ""

# Groq API Key
if [ ! -z "$GROQ_API_KEY" ]; then
    echo -n "$GROQ_API_KEY" | gcloud secrets create groq-api-key --data-file=- 2>/dev/null || \
    echo -n "$GROQ_API_KEY" | gcloud secrets versions add groq-api-key --data-file=-
    echo "✅ Groq API key saved"
else
    echo "⚠️  GROQ_API_KEY not set, skipping..."
fi

# MongoDB URI
if [ ! -z "$MONGODB_URI" ]; then
    echo -n "$MONGODB_URI" | gcloud secrets create mongodb-uri --data-file=- 2>/dev/null || \
    echo -n "$MONGODB_URI" | gcloud secrets versions add mongodb-uri --data-file=-
    echo "✅ MongoDB URI saved"
else
    echo "⚠️  MONGODB_URI not set, skipping..."
fi

# JWT Secret
if [ -z "$JWT_SECRET" ]; then
    JWT_SECRET=$(openssl rand -hex 32)
    echo "🔑 Generated JWT Secret automatically"
fi
echo -n "$JWT_SECRET" | gcloud secrets create jwt-secret --data-file=- 2>/dev/null || \
echo -n "$JWT_SECRET" | gcloud secrets versions add jwt-secret --data-file=-
echo "✅ JWT Secret saved"

# CORS Origins
if [ ! -z "$CORS_ORIGINS" ]; then
    echo -n "$CORS_ORIGINS" | gcloud secrets create cors-origins --data-file=- 2>/dev/null || \
    echo -n "$CORS_ORIGINS" | gcloud secrets versions add cors-origins --data-file=-
    echo "✅ CORS Origins saved"
else
    echo "⚠️  CORS_ORIGINS not set (you can update this later after deploying frontend)"
fi

# Grant service account access to secrets
echo ""
echo "🔑 Granting service account access to secrets..."

for secret in groq-api-key mongodb-uri jwt-secret cors-origins; do
    if gcloud secrets describe $secret >/dev/null 2>&1; then
        gcloud secrets add-iam-policy-binding $secret \
            --member="serviceAccount:${SERVICE_ACCOUNT}" \
            --role="roles/secretmanager.secretAccessor" 2>/dev/null || \
        echo "⚠️  Policy for $secret already exists"
    else
        echo "⚠️  Secret $secret doesn't exist, skipping policy binding"
    fi
done

echo ""
echo "✅ Secrets setup complete!"
echo ""
echo "📋 Created secrets:"
gcloud secrets list --filter="name:groq-api-key OR name:mongodb-uri OR name:jwt-secret OR name:cors-origins" --format="table(name)" 2>/dev/null || echo "  (Some secrets may not exist yet)"


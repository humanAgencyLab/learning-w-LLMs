#!/bin/bash

# Helper script to deploy with credentials
# This script will prompt you for credentials securely

set -e

export PATH="$HOME/google-cloud-sdk/bin:$PATH"

echo "🚀 Study Assist Deployment Setup"
echo "=================================="
echo ""
echo "This script will help you set up secrets and deploy."
echo ""
echo "📋 You'll need:"
echo "  1. Groq API Key (from https://console.groq.com)"
echo "  2. MongoDB Atlas connection string"
echo "  3. (Optional) CORS origins (can set later)"
echo ""

# Check if project is set
PROJECT_ID=$(gcloud config get-value project)
if [ -z "$PROJECT_ID" ]; then
    echo "❌ No Google Cloud project set"
    exit 1
fi

echo "✅ Project: $PROJECT_ID"
echo ""

# Check if APIs are enabled
echo "🔍 Checking APIs..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com artifactregistry.googleapis.com firebase.googleapis.com 2>&1 | grep -E "(enabled|already enabled)" || true

echo ""
echo "Ready to set up secrets!"
echo ""
echo "Please provide your credentials when prompted:"
echo ""

# Run the interactive setup
./scripts/setup-secrets.sh


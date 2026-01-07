# Fix MongoDB Connection Issue

## Problem

The MongoDB password contains a `#` character which needs to be URL-encoded as `%23` in the connection string.

Current (broken): `mongodb+srv://user:StudyAssitst2026#@cluster...`  
Fixed: `mongodb+srv://user:StudyAssitst2026%23@cluster...`

## Solution

Update the MongoDB URI secret with the URL-encoded password:

```bash
# URL-encode the password: # becomes %23
MONGODB_URI="mongodb+srv://yjunctionbd_db_user:StudyAssitst2026%23@clusterm0.0ueos4y.mongodb.net/?appName=ClusterM0"

# Update the secret
echo -n "$MONGODB_URI" | gcloud secrets versions add mongodb-uri --data-file=-

# Update the Cloud Run service
gcloud run services update study-assist-backend \
  --update-secrets="MONGODB_URI=mongodb-uri:latest" \
  --region us-central1
```

## Alternative: Use Google Cloud Console

If the CLI doesn't work due to billing permissions:

1. Go to: https://console.cloud.google.com/secret-manager/secret/mongodb-uri/versions?project=study-assist-prod
2. Click "Add New Version"
3. Paste the encoded URI: `mongodb+srv://yjunctionbd_db_user:StudyAssitst2026%23@clusterm0.0ueos4y.mongodb.net/?appName=ClusterM0`
4. Click "Add Version"
5. Then update Cloud Run service (via Console or CLI)

## Verify Fix

After updating, check the logs:

```bash
gcloud run services logs read study-assist-backend --region us-central1 --limit 20
```

You should see: "✅ Connected to MongoDB" instead of the error.


# Frontend Deployment Options

This guide covers different options for deploying your React frontend.

## Option 1: Firebase Hosting (Recommended for Now) ✅

**Free Tier:**
- 1 GB storage
- 10 GB data transfer/month
- Free HTTPS and CDN
- Part of Google Cloud (uses free credits)

**Why it's good:**
- Free and easy setup
- Perfect for temporary hosting
- Easy to migrate away later
- Uses your Google Cloud free credits

**How to deploy:**
```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Initialize (in project root)
firebase init hosting
# Select: existing project (study-assist-prod)
# Public directory: frontend/my-app/build
# Single-page app: Yes

# Build and deploy
cd frontend/my-app
echo "REACT_APP_API_BASE_URL=https://your-backend-url.run.app" > .env.production
npm install
npm run build
cd ../..
firebase deploy --only hosting
```

**Your site will be at:** `https://study-assist-prod.web.app` (or your custom domain)

---

## Option 2: Deploy to University Server (For Later) 🎓

When your university gives you SSH access, you can easily migrate:

### Steps to Deploy to University Server:

1. **Build the frontend locally:**
   ```bash
   cd frontend/my-app
   echo "REACT_APP_API_BASE_URL=https://your-backend-url.run.app" > .env.production
   npm install
   npm run build
   ```

2. **The build output** will be in `frontend/my-app/build/` folder
   - This contains all static files (HTML, CSS, JS)
   - Typically 1-5 MB total

3. **Copy to university server via SSH:**
   ```bash
   # Compress the build folder
   cd frontend/my-app
   tar -czf build.tar.gz build/
   
   # Copy to university server
   scp build.tar.gz username@university-server.edu:/path/to/web/root/
   
   # SSH into server
   ssh username@university-server.edu
   
   # Extract on server
   cd /path/to/web/root/
   tar -xzf build.tar.gz
   # Move files to web root (or configure web server to point to build/)
   ```

4. **Configure web server** (Nginx/Apache):
   - Point document root to the `build/` folder
   - Configure for single-page app (SPA) routing
   - Example Nginx config:
   ```nginx
   server {
       listen 80;
       server_name your-domain.edu;
       root /path/to/build;
       index index.html;
       
       location / {
           try_files $uri $uri/ /index.html;
       }
   }
   ```

**Note:** The frontend is just static files, so you can host it anywhere - even a simple web server works!

---

## Option 3: Google Cloud Storage + Cloud CDN (Alternative)

**Free Tier:**
- 5 GB storage
- 1 GB egress/month (then $0.12/GB)
- More complex setup

**Steps:**
1. Create a Cloud Storage bucket
2. Upload build files
3. Configure as static website
4. Set up Cloud CDN (optional)
5. Configure custom domain

**Why not recommended:** More setup work, and you're moving to university server anyway.

---

## Migration Path: Firebase → University Server

When ready to move:

1. **Build frontend** (same command as Firebase)
2. **Copy `build/` folder** to university server
3. **Update DNS** (point domain to university server)
4. **Update CORS** in backend secrets:
   ```bash
   echo -n "https://your-domain.edu" | gcloud secrets versions add cors-origins --data-file=-
   gcloud run services update study-assist-backend \
     --update-secrets="CORS_ORIGINS=cors-origins:latest" \
     --region us-central1
   ```

That's it! The frontend is just static files, so migration is simple.

---

## Cost Comparison

| Option | Cost | Ease of Setup | Best For |
|--------|------|---------------|----------|
| Firebase Hosting | **Free** (1GB/10GB) | ⭐⭐⭐⭐⭐ Easy | Temporary hosting |
| University Server | **Free** | ⭐⭐⭐ Medium | Permanent hosting |
| Cloud Storage + CDN | Free tier + $ | ⭐⭐ Complex | Large scale |

---

## Recommendation

**For now:** Use Firebase Hosting
- Quick setup
- Free
- Uses Google Cloud free credits
- Easy migration later

**For later:** Move to university server
- Free and permanent
- Full control
- Your domain
- Just copy the build folder!


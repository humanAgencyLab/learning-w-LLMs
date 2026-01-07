# Firebase Hosting Setup - Quick Steps

Firebase Hosting needs to be initialized once. Run these commands in your terminal:

## Step 1: Initialize Firebase Hosting

```bash
cd /Users/nibir/Documents/Research/Working\ Repo/learning-w-LLMs
firebase init hosting
```

When prompted:
1. **Select existing project**: Choose `study-assist-prod`
2. **What do you want to use as your public directory?**: Type `frontend/my-app/build`
3. **Configure as a single-page app**: Type `Yes`
4. **Set up automatic builds and deploys with GitHub?**: Type `No`
5. **File frontend/my-app/build/index.html already exists. Overwrite?**: Type `No`

This will create the default hosting site.

## Step 2: Deploy

After initialization, deploy:

```bash
cd frontend/my-app
npm run build  # Make sure it's built
cd ../..
firebase deploy --only hosting
```

## Your Site

After deployment, your site will be at:
- **https://study-assist-prod.web.app**

That's it! The frontend will be live.


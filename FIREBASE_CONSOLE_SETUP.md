# Create Firebase Hosting Site via Console

Since the project was created through gcloud, we need to create the hosting site through the Firebase Console.

## Step 1: Open Firebase Console

Go to: **https://console.firebase.google.com/project/study-assist-prod/hosting**

## Step 2: Get Started with Hosting

1. Click **"Get Started"** or **"Add another site"** button
2. You'll see a dialog to create a new site
3. Enter site ID: `study-assist-prod` (or use the default)
4. Click **"Create site"**

## Step 3: Deploy via CLI

After the site is created in the console, come back to your terminal and run:

```bash
cd /Users/nibir/Documents/Research/Working\ Repo/learning-w-LLMs
firebase deploy --only hosting
```

That's it! The site will be created and deployed.

## Alternative: Use Default Site

Firebase might automatically create a default site. After creating it in the console, check:

```bash
firebase hosting:sites:list
```

You should see your site listed. Then deploy as normal.


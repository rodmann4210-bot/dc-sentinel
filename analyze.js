# DC Sentinel Autonomous — Setup Guide
# Plain English, step by step. Takes about 20 minutes total.

════════════════════════════════════════════════════════════
WHAT YOU'RE SETTING UP
════════════════════════════════════════════════════════════

A backend that runs automatically every 30 minutes and:
  ✓ Fetches aircraft data from OpenSky
  ✓ Checks Federal Register for emergency documents
  ✓ Searches for active TFRs over DC
  ✓ Looks up hotel rates and car rentals
  ✓ Scores everything with σ analysis
  ✓ Alerts you by email, SMS, and/or push notification
    when anything crosses 2σ
  ✓ Shows everything in a live dashboard on your phone


════════════════════════════════════════════════════════════
STEP 1 — CREATE A GITHUB ACCOUNT (free, 2 min)
════════════════════════════════════════════════════════════

1. Go to github.com
2. Click Sign Up
3. Use your Google account to sign in
4. You now have a GitHub account


════════════════════════════════════════════════════════════
STEP 2 — UPLOAD THE PROJECT TO GITHUB
════════════════════════════════════════════════════════════

1. Go to github.com and sign in
2. Click the + button (top right) → New repository
3. Name it: dc-sentinel
4. Set to Private
5. Click Create repository
6. Click "uploading an existing file"
7. Drag ALL the files from the dc-sentinel-autonomous folder:
     - package.json
     - vercel.json
     - .env.example
     - api/collect.js
     - api/data.js
     - api/subscribe.js
     - api/analyze.js
     - lib/signals.js
     - lib/notify.js
     - public/index.html
     - public/sw.js
8. Click Commit changes


════════════════════════════════════════════════════════════
STEP 3 — DEPLOY TO VERCEL (free, 3 min)
════════════════════════════════════════════════════════════

1. Go to vercel.com
2. Click Sign Up → Continue with GitHub
3. Click Add New → Project
4. Find dc-sentinel in the list, click Import
5. Click Deploy (accept all defaults)
6. Wait about 60 seconds
7. Vercel gives you a URL like: https://dc-sentinel-abc123.vercel.app
8. SAVE THIS URL — it's your app address


════════════════════════════════════════════════════════════
STEP 4 — ADD KV DATABASE (free, 2 min)
════════════════════════════════════════════════════════════

The app needs a small database to store readings.

1. In Vercel dashboard, click on your dc-sentinel project
2. Click the Storage tab
3. Click Create Database → KV
4. Name it: dc-sentinel-kv
5. Click Create and click Connect to your project
6. Vercel automatically adds the KV credentials — done


════════════════════════════════════════════════════════════
STEP 5 — ADD YOUR ENVIRONMENT VARIABLES (5 min)
════════════════════════════════════════════════════════════

This is where you plug in your credentials.

1. In Vercel dashboard → your project → Settings → Environment Variables
2. Add each variable below (Name = Value):

   REQUIRED:
   ANTHROPIC_API_KEY  = your Anthropic API key (sk-ant-api03-...)
   OPENSKY_USER       = your OpenSky username
   OPENSKY_PASS       = your OpenSky password
   ALERT_EMAIL        = rodmann4210@gmail.com
   CRON_SECRET        = type any random phrase here (e.g. "sentinel2026abc")
   APP_URL            = https://your-vercel-url.vercel.app

   FOR EMAIL ALERTS (free):
   RESEND_API_KEY     = get free key at resend.com (2 min signup)

   FOR SMS ALERTS (optional, ~$0.01/text):
   TWILIO_ACCOUNT_SID = from twilio.com (free trial)
   TWILIO_AUTH_TOKEN  = from twilio.com
   TWILIO_FROM_NUMBER = your Twilio phone number
   ALERT_PHONE        = your cell phone (e.g. +12145551234)

   FOR PUSH NOTIFICATIONS (free):
   Run this command in terminal: npx web-push generate-vapid-keys
   Copy the two keys it gives you:
   VAPID_PUBLIC_KEY   = (the public key)
   VAPID_PRIVATE_KEY  = (the private key)

3. After adding all variables, click Redeploy in the Deployments tab


════════════════════════════════════════════════════════════
STEP 6 — SIGN UP FOR RESEND (email alerts, free, 2 min)
════════════════════════════════════════════════════════════

1. Go to resend.com
2. Sign up with Google
3. Go to API Keys → Create API Key
4. Copy the key (starts with re_)
5. Paste it as RESEND_API_KEY in Vercel


════════════════════════════════════════════════════════════
STEP 7 — TEST IT
════════════════════════════════════════════════════════════

1. Open your Vercel URL in your phone browser
2. Bookmark it
3. The app will show "Waiting for first data collection"
4. To trigger immediately, open in browser:
   https://your-vercel-url.vercel.app/api/collect
   (add your CRON_SECRET as: ?token=your-cron-secret)
5. Wait 30 seconds, refresh the app
6. Data should start appearing


════════════════════════════════════════════════════════════
STEP 8 — ENABLE PUSH NOTIFICATIONS ON YOUR PHONE
════════════════════════════════════════════════════════════

1. Open the app on your phone
2. Tap the "Enable push notifications" button
3. Tap Allow when your phone asks
4. Done — you'll get a notification when anything crosses 2σ


════════════════════════════════════════════════════════════
ONGOING COSTS
════════════════════════════════════════════════════════════

  Vercel hosting:      FREE (hobby plan)
  Vercel KV database:  FREE (up to 30MB)
  Vercel cron jobs:    FREE (hobby plan)
  Resend email:        FREE (3,000/month)
  Twilio SMS:          ~$0.01 per message (optional)
  Anthropic API:       ~$0.05 per collection run
                       = ~$2.40/month at 30min intervals
  OpenSky:             FREE (registered account)

  TOTAL: ~$2.50/month (or free if you skip SMS)


════════════════════════════════════════════════════════════
NEED HELP?
════════════════════════════════════════════════════════════

Ask Claude in the Early Warning project chat.
Describe exactly what step you're on and what you see.

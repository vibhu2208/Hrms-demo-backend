# 🔧 Email Timeout Fix - Quick Action Required

## Problem

Your production deployment on Render is experiencing email connection timeouts:

```
Error: Connection timeout
code: 'ETIMEDOUT'
command: 'CONN'
```

## Root Cause

**Render blocks Gmail SMTP connections** for security reasons. This is common across cloud platforms.

## ✅ Solution (5 Minutes)

### Step 1: Sign up for Brevo (Free)

1. Go to: **https://www.brevo.com/**
2. Click "Sign up free"
3. Verify your email address

### Step 2: Get SMTP Credentials

1. Log in to Brevo
2. Go to: **Settings → SMTP & API**
3. Click **"Generate a new SMTP key"**
4. Copy the SMTP key (you'll need this)

### Step 3: Update Render Environment Variables

1. Go to your **Render Dashboard**
2. Select your **hrms-backend** service
3. Click **"Environment"** tab
4. Add these variables:

```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_brevo_email@example.com
SMTP_PASS=paste_your_smtp_key_here
EMAIL_USER=your_brevo_email@example.com
```

**Important:** Replace `your_brevo_email@example.com` with the email you used to sign up for Brevo.

### Step 4: Save and Redeploy

1. Click **"Save Changes"** in Render
2. Render will automatically redeploy (takes ~2 minutes)
3. Test by scheduling an interview

## What Changed in the Code

I've updated the email service with:

✅ **Timeout configuration** (60s connection timeout)
✅ **Automatic retry logic** (3 attempts with exponential backoff)
✅ **Connection pooling** (better performance)
✅ **Fallback SMTP support** (works with any SMTP provider)
✅ **Better error logging** (detailed failure messages)

## Alternative SMTP Providers

If you prefer not to use Brevo:

### SendGrid (100 emails/day free)
```
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=your_sendgrid_api_key
```

### Mailgun (100 emails/day free)
```
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=postmaster@your-domain.mailgun.org
SMTP_PASS=your_mailgun_password
```

## Testing

After deployment, test by:

1. Creating a candidate
2. Scheduling an interview
3. Check Render logs for: `✅ Email sent successfully`

## Need Help?

See `EMAIL_CONFIGURATION_GUIDE.md` for detailed troubleshooting.

---

**Estimated Time:** 5 minutes
**Cost:** Free (Brevo free tier: 300 emails/day)
**Difficulty:** Easy

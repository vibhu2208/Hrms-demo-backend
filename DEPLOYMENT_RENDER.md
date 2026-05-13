# 🚀 Render.com Deployment Guide - CORS Fix

## ❌ Current Issue
```
Access to XMLHttpRequest at 'https://hrms-backend-xbz8.onrender.com/api/auth/companies' 
from origin 'https://hrms-frontend-blush.vercel.app' has been blocked by CORS policy
```

## ✅ Solution: Set Environment Variables on Render

### Step 1: Go to Render Dashboard
1. Open https://dashboard.render.com
2. Click on your backend service: **hrms-backend-xbz8**
3. Go to **Environment** tab

### Step 2: Add/Update These Environment Variables

**CRITICAL - Must Set These:**

```bash
NODE_ENV=production
PORT=5001
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_secure_jwt_secret_here

# CORS Configuration (MOST IMPORTANT!)
FRONTEND_URL=https://hrms-frontend-blush.vercel.app
CORS_ORIGIN=https://hrms-frontend-blush.vercel.app

# Backend URL
BACKEND_URL=https://hrms-backend-xbz8.onrender.com
```

**Optional (Email, AI, etc.):**

```bash
# Email Configuration (if using email features)
EMAIL_USER=your_email@gmail.com
EMAIL_APP_PASSWORD=your_gmail_app_password

# AI Analysis (if using DeepSeek)
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_MODEL=deepseek-v3
```

### Step 3: Save and Redeploy

1. Click **Save Changes** button
2. Render will automatically redeploy your service
3. Wait 2-3 minutes for deployment to complete

### Step 4: Verify CORS is Working

Check backend logs on Render:
```
🔧 Backend Configuration: {
  environment: 'production',
  port: 5001,
  backendUrl: 'https://hrms-backend-xbz8.onrender.com',
  allowedOrigins: [ 'https://hrms-frontend-blush.vercel.app' ]
}
```

### Step 5: Test Frontend

1. Open https://hrms-frontend-blush.vercel.app
2. Try to login or access any page
3. CORS error should be gone! ✅

---

## 🔍 How CORS Works in Our App

Our backend automatically allows:
- ✅ `FRONTEND_URL` from environment variable
- ✅ `CORS_ORIGIN` from environment variable
- ✅ All `*.vercel.app` domains (Vercel preview URLs)
- ✅ Requests with no origin (mobile apps, Postman)

**Code Location:** `/src/config/api.config.js`

---

## 📋 Complete Environment Variables Checklist

Copy this to Render Environment tab:

```
NODE_ENV=production
PORT=5001
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/hrms?retryWrites=true&w=majority
JWT_SECRET=your_super_secret_jwt_key_min_32_chars
FRONTEND_URL=https://hrms-frontend-blush.vercel.app
CORS_ORIGIN=https://hrms-frontend-blush.vercel.app
BACKEND_URL=https://hrms-backend-xbz8.onrender.com
```

---

## 🐛 Troubleshooting

### Still Getting CORS Error?

1. **Check Render Logs:**
   - Go to Render Dashboard → Logs tab
   - Look for: `⚠️ CORS blocked request from origin:`
   - Verify allowed origins list

2. **Clear Browser Cache:**
   - Hard refresh: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)
   - Or open in Incognito mode

3. **Verify Environment Variables:**
   - Go to Render → Environment tab
   - Make sure `FRONTEND_URL` and `CORS_ORIGIN` are set correctly
   - No trailing slashes in URLs!

4. **Check Deployment Status:**
   - Make sure deployment is complete (green checkmark)
   - Wait 2-3 minutes after saving environment variables

### Multiple Frontend Domains?

If you have multiple frontend URLs (e.g., custom domain + Vercel):

```bash
CORS_ORIGIN=https://hrms-frontend-blush.vercel.app,https://your-custom-domain.com
```

Separate multiple origins with commas (no spaces).

---

## ✅ Success Indicators

After fixing, you should see:

**Backend Logs:**
```
🔧 Backend Configuration: {
  environment: 'production',
  allowedOrigins: [ 'https://hrms-frontend-blush.vercel.app' ]
}
✅ MongoDB Connected
🚀 Server running in production mode on port 5001
```

**Frontend:**
- ✅ No CORS errors in browser console
- ✅ API calls working
- ✅ Login successful
- ✅ Data loading properly

---

## 📞 Need Help?

If CORS is still not working after following these steps:

1. Check Render logs for error messages
2. Verify MongoDB connection string is correct
3. Make sure JWT_SECRET is set
4. Ensure no typos in environment variable names
5. Try redeploying manually from Render dashboard

---

**Last Updated:** Nov 20, 2025

#!/bin/bash

# HRMS Backend Deployment Script for Render

echo "🚀 Preparing HRMS Backend for Render Deployment..."

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "📦 Initializing Git repository..."
    git init
    git add .
    git commit -m "Initial commit: HRMS Backend"
fi

# Check if remote origin exists
if ! git remote get-url origin > /dev/null 2>&1; then
    echo "⚠️  No remote origin found. Please add your GitHub repository:"
    echo "   git remote add origin https://github.com/yourusername/your-repo.git"
    echo "   git push -u origin main"
    exit 1
fi

# Add all files
echo "📁 Adding files to git..."
git add .

# Commit changes
echo "💾 Committing changes..."
git commit -m "Deploy: Prepare for Render deployment"

# Push to repository
echo "🚀 Pushing to repository..."
git push origin main

echo "✅ Code pushed to repository!"
echo ""
echo "📋 Next Steps:"
echo "1. Go to https://render.com"
echo "2. Create new Web Service"
echo "3. Connect your GitHub repository"
echo "4. Use these settings:"
echo "   - Build Command: npm install"
echo "   - Start Command: npm start"
echo "5. Add environment variables (see DEPLOYMENT.md)"
echo "6. Deploy!"

echo ""
echo "🔗 Your API will be available at: https://your-app-name.onrender.com"

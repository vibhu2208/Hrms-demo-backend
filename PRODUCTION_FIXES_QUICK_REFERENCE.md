# 🚨 Production Fixes - Quick Reference

## 🔴 CRITICAL - Fix Immediately

### 1. Add Security Headers (5 minutes)
```bash
npm install helmet
```

```javascript
// In app.js, after express() initialization
const helmet = require('helmet');
app.use(helmet());
```

### 2. Implement Rate Limiting (10 minutes)
```bash
npm install express-rate-limit
```

```javascript
// In app.js
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  message: 'Too many requests, please try again later.'
});

app.use('/api/', limiter);

// Stricter for auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true
});
app.use('/api/auth/login', authLimiter);
```

### 3. Replace Console Logging (1-2 hours)
```bash
npm install winston
```

Create `src/utils/logger.js`:
```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

module.exports = logger;
```

Then replace `console.log` → `logger.info`, `console.error` → `logger.error`

### 4. Create .env.example (5 minutes)
```env
# Database
MONGODB_URI=mongodb://localhost:27017/hrms

# Server
NODE_ENV=production
PORT=5001

# Security (REQUIRED - no defaults)
JWT_SECRET=your-secret-key-here
ENCRYPTION_KEY=your-32-byte-hex-key-here

# CORS
CORS_ORIGIN=https://your-frontend-url.com
FRONTEND_URL=https://your-frontend-url.com
```

### 5. Validate Required Environment Variables (5 minutes)
```javascript
// In app.js, before connecting to DB
const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET', 'ENCRYPTION_KEY'];
requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    console.error(`❌ Missing required environment variable: ${varName}`);
    process.exit(1);
  }
});
```

---

## 🟠 HIGH PRIORITY - Fix This Week

### 6. Improve Health Check (10 minutes)
```javascript
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {}
  };

  try {
    await mongoose.connection.db.admin().ping();
    health.checks.database = 'ok';
  } catch (error) {
    health.checks.database = 'error';
    health.status = 'degraded';
  }

  res.status(health.status === 'ok' ? 200 : 503).json(health);
});
```

### 7. Add Graceful Shutdown (5 minutes)
```javascript
// In app.js, after server.listen()
const server = app.listen(apiConfig.port, () => {
  console.log(`🚀 Server running on port ${apiConfig.port}`);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});
```

### 8. Optimize Dockerfile (10 minutes)
```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

FROM node:18-alpine
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
COPY --from=builder /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs . .
USER nodejs
EXPOSE 5001
HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "const port=process.env.PORT||5001;require('http').get('http://localhost:'+port+'/health',(r)=>{process.exit(r.statusCode===200?0:1)})"
CMD ["npm", "start"]
```

---

## 📦 Required NPM Packages

```bash
# Security
npm install helmet express-rate-limit

# Logging
npm install winston

# Testing (for later)
npm install --save-dev jest supertest

# Optional but recommended
npm install compression  # Response compression
# express-validator is already installed in this project; start using it consistently
```

---

## ✅ Quick Wins Checklist

- [ ] Install and configure Helmet
- [ ] Add rate limiting
- [ ] Create .env.example
- [ ] Validate required env vars
- [ ] Improve health check
- [ ] Add graceful shutdown
- [ ] Optimize Dockerfile

**Time Estimate:** 2-3 hours for all quick wins

---

## 🎯 Next Steps After Quick Fixes

1. Set up structured logging (Winston) - 1-2 hours
2. Add comprehensive input validation - 2-3 hours
3. Set up testing framework (Jest) - 2-3 hours
4. Add PM2 configuration - 30 minutes
5. Set up error monitoring (Sentry) - 1 hour

**Total Estimated Time:** 1-2 days for production-ready improvements

require('dotenv').config();

console.log('⏳ HRMS backend starting...');

process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err.message);
  console.error('Stack:', err.stack);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message);
  console.error('Stack:', err.stack);
  if (err.code === 'EADDRINUSE') {
    const apiConfig = require('./config/api.config');
    console.error(`\n⚠️  Port ${apiConfig.port} is already in use.`);
    console.error(`Stop the other process or set PORT in .env\n`);
    process.exit(1);
  }
});

console.log('⏳ Loading configuration...');
const apiConfig = require('./config/api.config');

console.log('⏳ Loading Express...');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const connectDB = require('./config/database');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

app.set('etag', false);

app.use(cors(apiConfig.corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'HRMS API is running',
    routesReady: Boolean(app.get('routesReady')),
    timestamp: new Date().toISOString(),
  });
});

const uploadsPath = path.join(__dirname, '../uploads');
const resumesPath = path.join(uploadsPath, 'resumes');
console.log('📁 Uploads directory path:', uploadsPath);

app.use('/uploads/resumes', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
}, express.static(resumesPath, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');
  },
  dotfiles: 'allow',
  index: false,
}));

app.use('/uploads', express.static(uploadsPath, {
  setHeaders: (res, filePath) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (filePath.endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
    }
  },
  dotfiles: 'allow',
  index: false,
}));

// Start listening immediately; mount heavy API routes after (non-blocking)
const server = app.listen(apiConfig.port, '0.0.0.0', () => {
  console.log(`🚀 Server listening on port ${apiConfig.port}`);
  console.log(`📡 API Base URL: ${apiConfig.backendUrl}`);
  console.log(`🌐 Health check: http://localhost:${apiConfig.port}/health`);

  connectDB();

  console.log('⏳ Loading API routes in background (first run may take 1–3 min)...');
  setImmediate(() => {
    try {
      const mountRoutes = require('./routes');
      mountRoutes(app);
      app.set('routesReady', true);
      console.log('✅ All API routes mounted');
    } catch (err) {
      console.error('❌ Failed to mount API routes:', err.message);
      console.error(err.stack);
    }

    app.use(errorHandler);
    app.use((req, res) => {
      res.status(404).json({
        success: false,
        message: 'Route not found',
      });
    });

    try {
      const { startCronJobs } = require('./utils/cronJobs');
      startCronJobs();
    } catch (err) {
      console.error('⚠️  Cron jobs failed to start:', err.message);
    }
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n⚠️  Port ${apiConfig.port} is already in use.`);
    console.error('Run: lsof -i :' + apiConfig.port);
    console.error('Then kill the process or change PORT in .env\n');
    process.exit(1);
  }
  console.error('Server error:', err);
});

module.exports = app;

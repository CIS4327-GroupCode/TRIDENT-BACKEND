require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const db = require('./db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sequelize = require('./database');

const app = express();

// CORS configuration - allow frontend to connect from multiple ports
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.FRONTEND_URL,
  // Add Vercel preview deployments
  /\.vercel\.app$/
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list or matches Vercel pattern
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return allowed === origin;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

app.use(express.json());

// Serve uploaded files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use('/api/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Handle OPTIONS requests explicitly for CORS preflight
app.options('*', cors());

// Favicon handler - prevent 404/500 errors
app.get('/favicon.ico', (req, res) => {
  res.status(204).send();
});

app.get('/favicon.png', (req, res) => {
  res.status(204).send();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

//ROUTES
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const organizationRoutes = require('./routes/organizationRoutes');
const researcherRoutes = require('./routes/researcherRoutes');
const adminRoutes = require('./routes/adminRoutes');
const projectRoutes = require('./routes/projectRoutes');
const messageRoutes = require('./routes/messagesRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const applicationRoutes = require('./routes/applicationRoutes');
const matchRoutes = require('./routes/matchRoutes');
const agreementRoutes = require('./routes/agreementRoutes');

//home route just to check if server is running
app.get('/', (req, res) => {
  res.send('Trident Backend is running');
});

// Mount routes with /api prefix for clarity
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/researchers', researcherRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/agreements', agreementRoutes);

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const PORT = process.env.PORT || 5000;

// Validate critical environment variables
function validateEnvironment() {
  const requiredVars = ['DATABASE_URL', 'JWT_SECRET'];
  const missing = requiredVars.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Initialize and export app without calling listen()
try {
  validateEnvironment();
} catch (error) {
  console.error('✗ Environment validation failed:', error.message);
  process.exit(1);
}

// Start server only in local/Node.js environment (not in Vercel)
if (process.env.VERCEL !== '1') {
  async function startServer() {
    try {
      // Test database connection
      await sequelize.authenticate();
      console.log('✓ Database connection established successfully');
      
      // Sync database (use migrations in production!)
      if (process.env.NODE_ENV !== 'production') {
        await sequelize.sync({ alter: false });
        console.log('✓ Database synchronized');
      }

      // Schedule notification cleanup task
      try {
        const notificationCleanup = require('./tasks/notificationCleanup');
        const milestoneDeadlineChecker = require('./tasks/milestoneDeadlineChecker');
        const matchGenerationJob = require('./tasks/matchGenerationJob');
        const attachmentRetentionCleanup = require('./tasks/attachmentRetentionCleanup');
        notificationCleanup.scheduleCleanup();
        milestoneDeadlineChecker.scheduleDeadlineChecks();
        matchGenerationJob.scheduleMatchGeneration();
        attachmentRetentionCleanup.scheduleAttachmentRetentionCleanup();
      } catch (cleanupError) {
        console.warn('⚠ Failed to schedule notification cleanup:', cleanupError.message);
        // Don't fail server startup if scheduling fails
      }
      
      app.listen(PORT, () => {
        console.log(`✓ Backend server running on http://localhost:${PORT}`);
        console.log(`✓ Health check available at http://localhost:${PORT}/health`);
        console.log(`✓ API endpoints available at http://localhost:${PORT}/api/*`);
      });
    } catch (error) {
      console.error('✗ Failed to start server:', error.message);
      console.error('Full error:', error);
      process.exit(1);
    }
  }

  // Only start server if not in test mode and not imported as a module
  if (process.env.NODE_ENV !== 'test') {
    startServer();
  }
}

// Export app for Vercel serverless functions and tests
module.exports = app;
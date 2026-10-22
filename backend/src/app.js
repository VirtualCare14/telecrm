const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/db');

const pingRouter = require('./routes/ping');
const authRouter = require('./routes/auth');
const agentsRouter = require('./routes/agents');
const leadsRouter = require('./routes/leads');
const transferRouter = require('./routes/transferRequests');
const adminRouter = require('./routes/admin');
const dashboardRouter = require('./routes/dashboard');
const rolesRouter = require('./routes/roles');
const notificationsRouter = require('./routes/notifications');

const app = express();

connectDB();

// Trust proxy for secure cookies behind Nginx reverse proxy
app.set('trust proxy', 1);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// Ensure uploads directory exists and is served statically
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
const leadUploadsDir = path.join(uploadsDir, 'leads');
if (!fs.existsSync(leadUploadsDir)) {
  fs.mkdirSync(leadUploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5174';
const additionalOrigins = ['http://localhost:5173', 'http://localhost:5174', 'https://orangevc.in'];
const corsOrigins = FRONTEND_URL ? [FRONTEND_URL, ...additionalOrigins] : additionalOrigins;

// Allow all origins in development mode
const isDevelopment = process.env.NODE_ENV !== 'production';

app.use(cors({ 
  origin: (origin, callback) => {
    // Allow all origins in development
    if (isDevelopment) {
      return callback(null, true);
    }
    // In production, check against allowed list
    if (!origin || corsOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS origin not allowed'));
    }
  }, 
  credentials: true 
}));

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));

// Ensure ping health check is always reachable
app.use('/api/ping', pingRouter);

// Immediate feedback if MongoDB is disconnected rather than hanging for 10s
app.use((req, res, next) => {
  if (mongoose.connection.readyState === 0) {
    return res.status(503).json({
      message: 'Database is currently unreachable. Please ensure MongoDB is running and MONGO_URI is configured in .env.',
      database: 'disconnected'
    });
  }
  next();
});

app.use('/api/auth', authRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/transfer-requests', transferRouter);
app.use('/api/admin', adminRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/roles', rolesRouter);
app.use('/api/notifications', notificationsRouter);

app.use((req, res, next) => {
  res.status(404).json({ message: 'Not Found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Server Error' });
});

module.exports = app;

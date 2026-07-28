const express = require('express');
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

const app = express();

connectDB();

// Trust proxy for secure cookies behind Nginx reverse proxy
app.set('trust proxy', 1);

app.use(helmet());

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
app.use(express.json());
app.use(morgan('dev'));

app.use('/api/ping', pingRouter);
app.use('/api/auth', authRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/transfer-requests', transferRouter);
app.use('/api/admin', adminRouter);
app.use('/api/dashboard', dashboardRouter);

app.use((req, res, next) => {
  res.status(404).json({ message: 'Not Found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Server Error' });
});

module.exports = app;

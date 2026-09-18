const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');

const DB_STATES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

router.get('/', (req, res) => {
  const dbStatus = DB_STATES[mongoose.connection.readyState] || 'unknown';
  res.json({
    message: 'pong',
    database: dbStatus,
    time: new Date().toISOString(),
  });
});

module.exports = router;

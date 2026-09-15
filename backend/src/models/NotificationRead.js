const mongoose = require('mongoose');

const notificationReadSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  alertId: {
    type: String,
    required: true,
    index: true,
  },
  readAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

// Compound unique index so each user has at most one read record per alert
notificationReadSchema.index({ user: 1, alertId: 1 }, { unique: true });

module.exports = mongoose.model('NotificationRead', notificationReadSchema);

const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  valid: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },
  refreshToken: { type: String },
  refreshExpiresAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Session', sessionSchema);

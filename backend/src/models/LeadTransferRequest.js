const mongoose = require('mongoose');

const transferSchema = new mongoose.Schema({
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
  fromAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  toAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'], default: 'Pending' },
  requestedAt: { type: Date, default: Date.now },
  respondedAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('LeadTransferRequest', transferSchema);

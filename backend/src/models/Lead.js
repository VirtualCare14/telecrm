const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  leadNumber: { type: String, required: true, unique: true },
  organizationName: { type: String, required: true },
  industry: { type: String, default: '' },
  organizationType: { type: String, default: '' },
  address: { type: String, default: '' },
  leadSource: { type: String, required: true },
  currentOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  primaryContact: { type: mongoose.Schema.Types.ObjectId, ref: 'ContactPerson' },
  latestDisposition: { type: String },
  latestRemark: { type: String },
  lastCalledAt: { type: Date },
  nextFollowUpAt: { type: Date },
  existingSoftwareUsed: { type: String, enum: ['Yes', 'No', 'Unknown'], default: 'Unknown' },
  softwareName: { type: String },
  closureStatus: { type: String, enum: ['OPEN', 'WON', 'LOST'], default: 'OPEN' },
  closingRemark: { type: String },
  dealValue: { type: Number },
  product: { type: String },
  lostReason: { type: String },
  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  closedAt: { type: Date },
}, { timestamps: true });

// Indexes for performance
leadSchema.index({ leadNumber: 1 });
leadSchema.index({ currentOwner: 1 });
leadSchema.index({ organizationName: 1 });
leadSchema.index({ nextFollowUpAt: 1 });
leadSchema.index({ closureStatus: 1 });
leadSchema.index({ createdAt: -1 });
leadSchema.index({ organizationName: 'text', leadNumber: 'text' });

module.exports = mongoose.model('Lead', leadSchema);
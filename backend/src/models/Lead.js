const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  leadNumber: { type: String, required: true, unique: true },
  organizationName: { type: String, required: true },
  industry: { type: String, default: '' },
  organizationType: { type: String, default: '' },
  address: { type: String, default: '' },
  leadSource: { type: String, required: true },
  remarks: { type: String, default: '' },
  sourceRemarks: { type: String, default: '' },
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
  status: { type: String, enum: ['OPEN', 'WON', 'LOST'], default: 'OPEN' },
  closingRemark: { type: String },
  dealValue: { type: Number },
  product: { type: String },
  lostReason: { type: String },
  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  closedAt: { type: Date },
  latestWalkIn: {
    walkInDate: { type: Date },
    walkInTime: { type: String },
    remark: { type: String },
    status: { type: String, enum: ['Planned', 'Done', 'Completed', 'Not Done'], default: 'Planned' },
    salesAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    salesAgentName: { type: String },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedByName: { type: String },
    recordedAt: { type: Date },
  },
  latestDemo: {
    demoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Demo' },
    demoDate: { type: Date },
    demoTime: { type: String },
    status: { type: String, enum: ['Planned', 'Done', 'Not Done'] },
    remarks: { type: String },
    salesAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    salesAgentName: { type: String },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedByName: { type: String },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedByName: { type: String },
    scheduledAt: { type: Date },
    updatedAt: { type: Date },
  },
  latestSalesFollowUp: {
    followUpId: { type: mongoose.Schema.Types.ObjectId, ref: 'FollowUp' },
    followUpDate: { type: Date },
    followUpTime: { type: String },
    status: { type: String, enum: ['Planned', 'Done', 'Completed', 'Not Done'] },
    remarks: { type: String },
    salesAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    salesAgentName: { type: String },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedByName: { type: String },
    scheduledAt: { type: Date },
    updatedAt: { type: Date },
  },
  ownershipHistory: [
    {
      previousOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      previousOwnerName: { type: String },
      newOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      newOwnerName: { type: String },
      transferredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      transferredByName: { type: String },
      transferredAt: { type: Date, default: Date.now },
      remarks: { type: String, default: '' },
      reason: { type: String, default: '' },
      isInitial: { type: Boolean, default: false },
    }
  ],
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
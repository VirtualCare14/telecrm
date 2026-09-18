const mongoose = require('mongoose');

const followUpSchema = new mongoose.Schema({
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
  salesAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  followUpDate: { type: Date, required: true },
  followUpTime: { type: String, default: '10:00' },
  status: { 
    type: String, 
    enum: ['Planned', 'Done', 'Completed', 'Not Done'], 
    default: 'Planned',
    required: true,
  },
  remarks: { type: String, default: '' },
}, { timestamps: true });

followUpSchema.index({ lead: 1, createdAt: -1 });
followUpSchema.index({ salesAgent: 1 });
followUpSchema.index({ assignedBy: 1 });
followUpSchema.index({ status: 1 });
followUpSchema.index({ followUpDate: 1 });

module.exports = mongoose.model('FollowUp', followUpSchema);

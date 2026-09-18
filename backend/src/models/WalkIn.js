const mongoose = require('mongoose');

const walkInSchema = new mongoose.Schema({
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
  salesAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  walkInDate: { type: Date, required: true },
  walkInTime: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['Planned', 'Done', 'Completed', 'Not Done'], 
    default: 'Planned' 
  },
  remark: { type: String, required: true },
}, { timestamps: true });

walkInSchema.index({ lead: 1, createdAt: -1 });
walkInSchema.index({ salesAgent: 1 });
walkInSchema.index({ assignedBy: 1 });
walkInSchema.index({ status: 1 });
walkInSchema.index({ walkInDate: 1 });

module.exports = mongoose.model('WalkIn', walkInSchema);

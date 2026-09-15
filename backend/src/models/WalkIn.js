const mongoose = require('mongoose');

const walkInSchema = new mongoose.Schema({
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
  salesAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  walkInDate: { type: Date, required: true },
  walkInTime: { type: String, required: true },
  remark: { type: String, required: true },
}, { timestamps: true });

walkInSchema.index({ lead: 1, createdAt: -1 });
walkInSchema.index({ salesAgent: 1 });

module.exports = mongoose.model('WalkIn', walkInSchema);

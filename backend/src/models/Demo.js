const mongoose = require('mongoose');

const demoSchema = new mongoose.Schema({
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
  salesAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  demoDate: { type: Date, required: true },
  demoTime: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['Planned', 'Done', 'Not Done'], 
    default: 'Planned',
    required: true 
  },
  remarks: { type: String, default: '' },
}, { timestamps: true });

demoSchema.index({ lead: 1, createdAt: -1 });
demoSchema.index({ salesAgent: 1 });
demoSchema.index({ status: 1 });

module.exports = mongoose.model('Demo', demoSchema);

const mongoose = require('mongoose');

const callLogSchema = new mongoose.Schema({
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  calledContact: { type: mongoose.Schema.Types.ObjectId, ref: 'ContactPerson', required: true },
  calledAt: { type: Date, required: true },
  disposition: { type: String, required: true },
  remark: { type: String, required: true },
  followUpAt: { type: Date },
}, { timestamps: true });

callLogSchema.index({ lead: 1, createdAt: -1 });

module.exports = mongoose.model('CallLog', callLogSchema);

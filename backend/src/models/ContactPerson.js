const mongoose = require('mongoose');

const contactPersonSchema = new mongoose.Schema({
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
  name: { type: String, required: true },
  designation: { type: String },
  phone: { type: String, required: true },
  altPhone: { type: String },
  email: { type: String },
  isPrimary: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('ContactPerson', contactPersonSchema);

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
  latitude: { type: Number, default: null },
  longitude: { type: Number, default: null },
  accuracy: { type: Number, default: null },
  locationCapturedAt: { type: Date, default: null },
  locationStatus: { 
    type: String, 
    enum: ['Captured', 'Permission Denied', 'Unavailable', 'Timed Out', 'Not Requested'], 
    default: 'Not Requested' 
  },
  deviceInstallationId: { type: String, default: null, trim: true },
  hospitalLatitude: { type: Number, default: null },
  hospitalLongitude: { type: Number, default: null },
  distanceMetres: { type: Number, default: null },
  geofenceStatus: {
    type: String,
    enum: ['Passed', 'Failed', 'Exempt', 'Not Verified'],
    default: 'Not Verified',
  },
  geofenceReason: { type: String, default: null },
}, { timestamps: true });

walkInSchema.index({ lead: 1, createdAt: -1 });
walkInSchema.index({ salesAgent: 1 });
walkInSchema.index({ assignedBy: 1 });
walkInSchema.index({ status: 1 });
walkInSchema.index({ walkInDate: 1 });

module.exports = mongoose.model('WalkIn', walkInSchema);

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
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedByName: { type: String, default: null },
  hospitalCoordinates: {
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    isVerified: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    source: { type: String, default: null },
  },
  createdLocation: {
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    accuracy: { type: Number, default: null },
    capturedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['Captured', 'Permission Denied', 'Unavailable', 'Timed Out', 'Not Requested'],
      default: 'Not Requested',
    },
    distanceMetres: { type: Number, default: null },
    geofenceStatus: {
      type: String,
      enum: ['Passed', 'Failed', 'Exempt', 'Not Verified'],
      default: 'Not Verified',
    },
    geofenceReason: { type: String, default: null },
  },
  createdDeviceInstallationId: { type: String, default: null, trim: true },
  createdDeviceName: { type: String, default: null, trim: true },
  visitPhoto: {
    url: { type: String, default: null },
    filename: { type: String, default: null },
    contentType: { type: String, default: null },
    sizeBytes: { type: Number, default: null },
    capturedAt: { type: Date, default: null },
    capturedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    capturedByName: { type: String, default: null },
    deviceInstallationId: { type: String, default: null },
  },
  primaryContact: { type: mongoose.Schema.Types.ObjectId, ref: 'ContactPerson' },
  leadTemperature: {
    type: String,
    enum: ['Hot', 'Warm', 'Cold', 'hot', 'warm', 'cold', null],
    default: null,
  },
  disposition: { type: String, default: null },
  temperatureUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  temperatureUpdatedByName: { type: String, default: null },
  temperatureUpdatedAt: { type: Date, default: null },
  dispositionUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  dispositionUpdatedByName: { type: String, default: null },
  dispositionUpdatedAt: { type: Date, default: null },
  temperatureHistory: [
    {
      temperature: { type: String, enum: ['Hot', 'Warm', 'Cold', 'hot', 'warm', 'cold', null] },
      previousTemperature: { type: String, default: null },
      changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      changedByName: { type: String, default: null },
      changedAt: { type: Date, default: Date.now },
      source: { type: String, default: 'Action' },
      remark: { type: String, default: null },
    }
  ],
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
    googleMapsUrl: { type: String, default: null },
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
leadSchema.index({ createdBy: 1 });
leadSchema.index({ updatedBy: 1 });
leadSchema.index({ organizationName: 1 });
leadSchema.index({ nextFollowUpAt: 1 });
leadSchema.index({ closureStatus: 1 });
leadSchema.index({ leadTemperature: 1 });
leadSchema.index({ disposition: 1 });
leadSchema.index({ createdAt: -1 });
leadSchema.index({ organizationName: 'text', leadNumber: 'text' });

module.exports = mongoose.model('Lead', leadSchema);
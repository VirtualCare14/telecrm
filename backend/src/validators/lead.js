const { body } = require('express-validator');

const validateCoordLat = (val) => {
  if (val === null || val === undefined || val === '') return true;
  const num = Number(val);
  if (Number.isNaN(num) || num < -90 || num > 90) {
    throw new Error('Latitude must be a valid number between -90 and 90');
  }
  return true;
};

const validateCoordLng = (val) => {
  if (val === null || val === undefined || val === '') return true;
  const num = Number(val);
  if (Number.isNaN(num) || num < -180 || num > 180) {
    throw new Error('Longitude must be a valid number between -180 and 180');
  }
  return true;
};

const validateAccuracy = (val) => {
  if (val === null || val === undefined || val === '') return true;
  const num = Number(val);
  if (Number.isNaN(num) || num < 0) {
    throw new Error('GPS accuracy must be a non-negative number');
  }
  return true;
};

const validateStatus = (val) => {
  if (val === null || val === undefined || val === '') return true;
  const allowed = ['Captured', 'Permission Denied', 'Unavailable', 'Timed Out', 'Not Requested'];
  if (!allowed.includes(val)) {
    throw new Error(`Location status must be one of: ${allowed.join(', ')}`);
  }
  return true;
};

const validateDeviceId = (val) => {
  if (val === null || val === undefined || val === '') return true;
  if (typeof val !== 'string' || val.length > 128) {
    throw new Error('Device installation ID must be a string up to 128 characters');
  }
  return true;
};

const validateDeviceName = (val) => {
  if (val === null || val === undefined || val === '') return true;
  if (typeof val !== 'string' || val.length > 128) {
    throw new Error('Device name must be a string up to 128 characters');
  }
  return true;
};

exports.createLead = [
  body('organizationName').trim().notEmpty().withMessage('organizationName is required'),
  body('leadSource').trim().notEmpty().withMessage('leadSource is required'),
  body('contacts').isArray({ min: 1 }).withMessage('At least one contact is required'),
  body('contacts.*.name').trim().notEmpty().withMessage('contact name is required'),
  body('contacts.*.phone').trim().notEmpty().withMessage('contact phone is required'),
  body('latitude').optional({ nullable: true }).custom(validateCoordLat),
  body('createdLocation.latitude').optional({ nullable: true }).custom(validateCoordLat),
  body('longitude').optional({ nullable: true }).custom(validateCoordLng),
  body('createdLocation.longitude').optional({ nullable: true }).custom(validateCoordLng),
  body('accuracy').optional({ nullable: true }).custom(validateAccuracy),
  body('createdLocation.accuracy').optional({ nullable: true }).custom(validateAccuracy),
  body('locationStatus').optional({ nullable: true }).custom(validateStatus),
  body('createdLocation.status').optional({ nullable: true }).custom(validateStatus),
  body('deviceInstallationId').optional({ nullable: true }).custom(validateDeviceId),
  body('createdDeviceInstallationId').optional({ nullable: true }).custom(validateDeviceId),
  body('createdLocation.deviceInstallationId').optional({ nullable: true }).custom(validateDeviceId),
  body('createdDeviceName').optional({ nullable: true }).custom(validateDeviceName),
  body('deviceName').optional({ nullable: true }).custom(validateDeviceName),
  body('hospitalLatitude').optional({ nullable: true }).custom(validateCoordLat),
  body('hospitalLongitude').optional({ nullable: true }).custom(validateCoordLng),
  body('hospitalCoordinates.latitude').optional({ nullable: true }).custom(validateCoordLat),
  body('hospitalCoordinates.longitude').optional({ nullable: true }).custom(validateCoordLng),
];

exports.updateLead = [
  body('organizationName').optional().trim().notEmpty().withMessage('organizationName cannot be empty'),
  body('leadSource').optional().trim().notEmpty().withMessage('leadSource cannot be empty'),
  body('contacts').optional().isArray({ min: 1 }).withMessage('At least one contact is required when updating contacts'),
  body('contacts.*.name').optional().trim().notEmpty().withMessage('contact name is required'),
  body('contacts.*.phone').optional().trim().notEmpty().withMessage('contact phone is required'),
  body('hospitalLatitude').optional({ nullable: true }).custom(validateCoordLat),
  body('hospitalLongitude').optional({ nullable: true }).custom(validateCoordLng),
  body('hospitalCoordinates.latitude').optional({ nullable: true }).custom(validateCoordLat),
  body('hospitalCoordinates.longitude').optional({ nullable: true }).custom(validateCoordLng),
];

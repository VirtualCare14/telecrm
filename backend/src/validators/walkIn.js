const { body } = require('express-validator');

exports.createWalkIn = [
  body('walkInDate')
    .trim()
    .notEmpty()
    .withMessage('Walk-in date is required')
    .isISO8601()
    .withMessage('Walk-in date must be a valid date'),
  body('walkInTime')
    .trim()
    .notEmpty()
    .withMessage('Walk-in time is required'),
  body('remark')
    .trim()
    .notEmpty()
    .withMessage('Walk-in remark is required'),
  body('latitude')
    .optional({ nullable: true })
    .custom((val) => {
      if (val === null || val === undefined || val === '') return true;
      const num = Number(val);
      if (Number.isNaN(num) || num < -90 || num > 90) {
        throw new Error('Latitude must be a valid number between -90 and 90');
      }
      return true;
    }),
  body('longitude')
    .optional({ nullable: true })
    .custom((val) => {
      if (val === null || val === undefined || val === '') return true;
      const num = Number(val);
      if (Number.isNaN(num) || num < -180 || num > 180) {
        throw new Error('Longitude must be a valid number between -180 and 180');
      }
      return true;
    }),
  body('accuracy')
    .optional({ nullable: true })
    .custom((val) => {
      if (val === null || val === undefined || val === '') return true;
      const num = Number(val);
      if (Number.isNaN(num) || num < 0) {
        throw new Error('GPS accuracy must be a non-negative number');
      }
      return true;
    }),
  body('locationStatus')
    .optional({ nullable: true })
    .custom((val) => {
      if (val === null || val === undefined || val === '') return true;
      const allowed = ['Captured', 'Permission Denied', 'Unavailable', 'Timed Out', 'Not Requested'];
      if (!allowed.includes(val)) {
        throw new Error(`Location status must be one of: ${allowed.join(', ')}`);
      }
      return true;
    }),
  body('deviceInstallationId')
    .optional({ nullable: true })
    .custom((val) => {
      if (val === null || val === undefined || val === '') return true;
      if (typeof val !== 'string' || val.trim().length > 128) {
        throw new Error('Device installation ID must be a string up to 128 characters');
      }
      return true;
    }),
  body('locationCapturedAt')
    .optional({ nullable: true })
    .custom((val) => {
      if (val === null || val === undefined || val === '') return true;
      const d = new Date(val);
      if (Number.isNaN(d.getTime())) {
        throw new Error('Location capture timestamp must be a valid date');
      }
      return true;
    }),
];


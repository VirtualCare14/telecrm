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
];

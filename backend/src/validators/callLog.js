const { body } = require('express-validator');

exports.createCallLog = [
  body('calledContactId').trim().notEmpty().withMessage('calledContactId is required'),
  body('disposition').trim().notEmpty().withMessage('disposition is required'),
  body('remark').trim().notEmpty().withMessage('remark is required'),
  body('calledAt').optional().isISO8601().withMessage('calledAt must be a valid ISO8601 date-time'),
  body('followUpAt').optional().isISO8601().withMessage('followUpAt must be a valid ISO8601 date-time'),
];

const { body } = require('express-validator');

exports.createCallLog = [
  body('calledContactId').optional().trim(),
  body('calledContactName').optional().trim(),
  body('contactName').optional().trim(),
  body('disposition').trim().notEmpty().withMessage('disposition is required'),
  body('remark').trim().notEmpty().withMessage('remark is required'),
  body('calledAt').optional({ checkFalsy: true }).isISO8601().withMessage('calledAt must be a valid ISO8601 date-time'),
  body('followUpAt').optional({ checkFalsy: true }).isISO8601().withMessage('followUpAt must be a valid ISO8601 date-time'),
  body().custom((value) => {
    if (!value.calledContactId && !value.calledContactName && !value.contactName) {
      throw new Error('Please select or enter a contact person');
    }
    return true;
  }),
];

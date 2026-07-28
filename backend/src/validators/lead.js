const { body } = require('express-validator');

exports.createLead = [
  body('organizationName').trim().notEmpty().withMessage('organizationName is required'),
  body('leadSource').trim().notEmpty().withMessage('leadSource is required'),
  body('contacts').isArray({ min: 1 }).withMessage('At least one contact is required'),
  body('contacts.*.name').trim().notEmpty().withMessage('contact name is required'),
  body('contacts.*.phone').trim().notEmpty().withMessage('contact phone is required'),
];

exports.updateLead = [
  body('organizationName').optional().trim().notEmpty().withMessage('organizationName cannot be empty'),
  body('leadSource').optional().trim().notEmpty().withMessage('leadSource cannot be empty'),
  body('contacts').optional().isArray({ min: 1 }).withMessage('At least one contact is required when updating contacts'),
  body('contacts.*.name').optional().trim().notEmpty().withMessage('contact name is required'),
  body('contacts.*.phone').optional().trim().notEmpty().withMessage('contact phone is required'),
];

const { body } = require('express-validator');
const Role = require('../models/Role');

exports.createAgent = [
  body('fullName').trim().notEmpty().withMessage('fullName is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('username').trim().notEmpty().withMessage('username is required'),
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone is required')
    .custom((val) => {
      const clean = (val || '').trim();
      const digits = clean.replace(/\D/g, '');
      if (!/^\+?[0-9\s\-()]{7,20}$/.test(clean) || digits.length < 7 || digits.length > 15) {
        throw new Error('Please enter a valid phone number');
      }
      return true;
    }),
  body('password').isLength({ min: 6 }).withMessage('password must be at least 6 characters'),
  body().custom(async (value, { req }) => {
    const role = (req.body.role || req.body.agentRole || '').trim();
    if (!role) {
      throw new Error('Role is required');
    }
    const roleDoc = await Role.findOne({
      name: { $regex: new RegExp(`^${role}$`, 'i') }
    });
    if (!roleDoc) {
      throw new Error(`Role "${role}" does not exist in the system`);
    }
    if (!roleDoc.active) {
      throw new Error(`Role "${roleDoc.name}" is inactive and cannot be assigned to agents`);
    }
    return true;
  }),
];

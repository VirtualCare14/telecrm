const { body } = require('express-validator');

exports.login = [
  body('usernameOrEmail').trim().notEmpty().withMessage('usernameOrEmail is required'),
  body('password').notEmpty().withMessage('password is required'),
];

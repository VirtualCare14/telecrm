const { body } = require('express-validator');

exports.createDemo = [
  body('demoDate')
    .trim()
    .notEmpty()
    .withMessage('Demo date is required')
    .isISO8601()
    .withMessage('Demo date must be a valid date'),
  body('demoTime')
    .trim()
    .notEmpty()
    .withMessage('Demo time is required'),
  body('status')
    .optional()
    .trim()
    .isIn(['Planned'])
    .withMessage('A newly scheduled demo must have status Planned'),
  body('remarks')
    .optional()
    .isString(),
];

exports.updateDemoStatus = [
  body('status')
    .trim()
    .notEmpty()
    .withMessage('Status is required')
    .isIn(['Planned', 'Done', 'Not Done'])
    .withMessage('Status must be Planned, Done, or Not Done'),
  body('remarks')
    .if(body('status').isIn(['Done', 'Not Done']))
    .trim()
    .notEmpty()
    .withMessage('Remarks are required when marking a demo as Done or Not Done'),
  body('remarks')
    .optional()
    .isString(),
  body('demoDate')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Demo date must be a valid date'),
  body('demoTime')
    .optional({ checkFalsy: true })
    .isString(),
];


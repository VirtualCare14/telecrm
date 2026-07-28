const express = require('express');
const router = express.Router();
const leadCtrl = require('../controllers/leadController');
const callLogCtrl = require('../controllers/callLogController');
const { authenticate, authorizeRole } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const leadValidator = require('../validators/lead');
const callLogValidator = require('../validators/callLog');

// Create lead (Agent/Admin)
router.post('/', authenticate, authorizeRole(['ADMIN', 'AGENT']), leadValidator.createLead, validate, leadCtrl.createLead);

// Duplicate check available to authenticated users
router.post('/check-duplicates', authenticate, leadCtrl.checkDuplicates);

// List leads (Admin can pass owner filter; Agent sees own leads)
router.get('/', authenticate, leadCtrl.listLeads);

// Contact management
router.get('/:id/contacts', authenticate, leadCtrl.listContacts);
router.post('/:id/contacts', authenticate, authorizeRole(['ADMIN', 'AGENT']), leadCtrl.addContact);
router.put('/:id/contacts/:contactId', authenticate, authorizeRole(['ADMIN', 'AGENT']), leadCtrl.updateContact);
router.patch('/:id/contacts/:contactId/set-primary', authenticate, authorizeRole(['ADMIN', 'AGENT']), leadCtrl.setPrimaryContact);

// Call logs for a lead
router.get('/:id/call-logs', authenticate, callLogCtrl.listCallLogs);
router.post('/:id/call-logs', authenticate, callLogValidator.createCallLog, validate, callLogCtrl.createCallLog);

// Lead activity trail
router.get('/:id/activities', authenticate, require('../controllers/activityController').listActivities);

// Transfer requests
router.post('/:id/transfer-request', authenticate, require('../controllers/transferController').requestTransfer);

// Update lead
router.put('/:id', authenticate, authorizeRole(['ADMIN', 'AGENT']), leadValidator.updateLead, validate, leadCtrl.updateLead);

// Close lead as Won or Lost
router.post('/:id/close-won', authenticate, leadCtrl.closeWon);
router.post('/:id/close-lost', authenticate, leadCtrl.closeLost);

// Get single lead (must be last to avoid matching other routes)
router.get('/:id', authenticate, leadCtrl.getLead);

module.exports = router;
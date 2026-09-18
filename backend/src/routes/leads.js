const express = require('express');
const router = express.Router();
const leadCtrl = require('../controllers/leadController');
const callLogCtrl = require('../controllers/callLogController');
const walkInCtrl = require('../controllers/walkInController');
const demoCtrl = require('../controllers/demoController');
const { authenticate, authorizeRole } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const leadValidator = require('../validators/lead');
const callLogValidator = require('../validators/callLog');
const walkInValidator = require('../validators/walkIn');
const demoValidator = require('../validators/demo');

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

// Walk-in records for a lead
router.get('/:id/walk-ins', authenticate, walkInCtrl.listWalkIns);
router.post('/:id/walk-ins', authenticate, authorizeRole(['ADMIN', 'AGENT']), walkInValidator.createWalkIn, validate, walkInCtrl.createWalkIn);
router.patch('/:id/walk-ins/:walkInId/status', authenticate, authorizeRole(['ADMIN', 'AGENT']), walkInCtrl.updateWalkInStatus);

// Demo records for a lead
router.get('/:id/demos', authenticate, demoCtrl.listDemos);
router.post('/:id/demos', authenticate, authorizeRole(['ADMIN', 'AGENT']), demoValidator.createDemo, validate, demoCtrl.createDemo);
router.patch('/:id/demos/:demoId/status', authenticate, authorizeRole(['ADMIN', 'AGENT']), demoValidator.updateDemoStatus, validate, demoCtrl.updateDemoStatus);

// Sales Follow-up records for a lead
router.get('/:id/sales-follow-ups', authenticate, leadCtrl.listSalesFollowUps);
router.post('/:id/sales-follow-ups', authenticate, authorizeRole(['ADMIN', 'AGENT']), leadCtrl.createSalesFollowUp);
router.patch('/:id/sales-follow-ups/:followUpId/status', authenticate, authorizeRole(['ADMIN', 'AGENT']), leadCtrl.updateSalesFollowUpStatus);

// Lead activity trail
router.get('/:id/activities', authenticate, require('../controllers/activityController').listActivities);
router.post('/:id/whatsapp', authenticate, authorizeRole(['ADMIN', 'AGENT']), require('../controllers/activityController').createWhatsAppActivity);

// Transfer lead (immediate ownership transfer with audit trail)
router.post('/:id/transfer', authenticate, authorizeRole(['ADMIN', 'AGENT']), leadCtrl.transferLead);

// Transfer requests
router.post('/:id/transfer-request', authenticate, require('../controllers/transferController').requestTransfer);

// Update lead
router.put('/:id', authenticate, authorizeRole(['ADMIN', 'AGENT']), leadValidator.updateLead, validate, leadCtrl.updateLead);

// Close lead as Won or Lost / Set Outcome
router.post('/:id/close-won', authenticate, leadCtrl.closeWon);
router.post('/:id/close-lost', authenticate, leadCtrl.closeLost);
router.post('/:id/outcome', authenticate, leadCtrl.setOutcome);

// Reschedule follow-up
router.patch('/:id/follow-up', authenticate, leadCtrl.rescheduleFollowUp);

// Complete follow-up
router.patch('/:id/complete-follow-up', authenticate, leadCtrl.completeFollowUp);

// Re-engage / reopen closed lead
router.post('/:id/reopen', authenticate, leadCtrl.reopenLead);

// Delete lead (Admin only)
router.delete('/:id', authenticate, authorizeRole(['ADMIN']), leadCtrl.deleteLead);

// Get single lead (must be last to avoid matching other routes)
router.get('/:id', authenticate, leadCtrl.getLead);

module.exports = router;
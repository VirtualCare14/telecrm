const express = require('express');
const router = express.Router();
const transferCtrl = require('../controllers/transferController');
const { authenticate } = require('../middlewares/auth');

router.post('/leads/:id/transfer-request', authenticate, transferCtrl.requestTransfer);
router.get('/incoming', authenticate, transferCtrl.incomingRequests);
router.get('/outgoing', authenticate, transferCtrl.outgoingRequests);
router.patch('/:id/approve', authenticate, transferCtrl.approveRequest);
router.patch('/:id/reject', authenticate, transferCtrl.rejectRequest);
router.delete('/:id/cancel', authenticate, transferCtrl.cancelRequest);

module.exports = router;

const express = require('express');
const router = express.Router();
const adminCtrl = require('../controllers/adminController');
const { authenticate, authorizeRole } = require('../middlewares/auth');

router.post('/leads/bulk-transfer', authenticate, authorizeRole(['ADMIN']), adminCtrl.bulkTransfer);
router.get('/export/raw-dump', authenticate, authorizeRole(['ADMIN']), adminCtrl.exportRawDump);

module.exports = router;

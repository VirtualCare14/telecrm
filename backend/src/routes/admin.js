const express = require('express');
const router = express.Router();
const adminCtrl = require('../controllers/adminController');
const { authenticate, authorizeRole } = require('../middlewares/auth');

router.post('/leads/bulk-transfer', authenticate, authorizeRole(['ADMIN']), adminCtrl.bulkTransfer);

module.exports = router;

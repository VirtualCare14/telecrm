const express = require('express');
const router = express.Router();
const dashboardCtrl = require('../controllers/dashboardController');
const { authenticate, authorizeRole } = require('../middlewares/auth');

router.get('/admin', authenticate, authorizeRole(['ADMIN']), dashboardCtrl.adminDashboard);
router.get('/reports', authenticate, authorizeRole(['ADMIN']), dashboardCtrl.reports);
router.get('/agent', authenticate, authorizeRole(['ADMIN', 'AGENT']), dashboardCtrl.agentDashboard);

module.exports = router;

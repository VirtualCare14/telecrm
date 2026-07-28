const express = require('express');
const router = express.Router();
const dashboardCtrl = require('../controllers/dashboardController');
const { authenticate, authorizeRole } = require('../middlewares/auth');

router.get('/admin', authenticate, authorizeRole(['ADMIN']), dashboardCtrl.adminDashboard);
router.get('/agent', authenticate, authorizeRole(['AGENT']), dashboardCtrl.agentDashboard);

module.exports = router;

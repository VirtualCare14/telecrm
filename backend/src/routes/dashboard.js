const express = require('express');
const router = express.Router();
const dashboardCtrl = require('../controllers/dashboardController');
const { authenticate, authorizeRole } = require('../middlewares/auth');

router.get('/admin', authenticate, authorizeRole(['ADMIN']), dashboardCtrl.adminDashboard);
router.get('/reports', authenticate, authorizeRole(['ADMIN']), dashboardCtrl.reports);
router.get('/agent', authenticate, authorizeRole(['ADMIN', 'AGENT']), dashboardCtrl.agentDashboard);
router.get('/daily-activity', authenticate, authorizeRole(['ADMIN']), dashboardCtrl.dailyActivityReport);
router.get('/daily-activity/export', authenticate, authorizeRole(['ADMIN']), dashboardCtrl.exportDailyActivityReport);
router.get('/activity-hospitals', authenticate, authorizeRole(['ADMIN', 'AGENT']), dashboardCtrl.activityHospitals);
router.get('/activity-hospitals/export', authenticate, authorizeRole(['ADMIN', 'AGENT']), dashboardCtrl.exportActivityHospitals);
router.get('/metric-records', authenticate, authorizeRole(['ADMIN', 'AGENT']), dashboardCtrl.dashboardMetricRecords);
router.get('/metric-records/export', authenticate, authorizeRole(['ADMIN', 'AGENT']), dashboardCtrl.exportDashboardMetricRecords);

module.exports = router;


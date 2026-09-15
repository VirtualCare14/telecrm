const express = require('express');
const router = express.Router();
const notificationCtrl = require('../controllers/notificationController');
const { authenticate } = require('../middlewares/auth');

// All notification routes require authentication
router.use(authenticate);

// Get all notifications for current user with unread counts
router.get('/', notificationCtrl.getNotifications);

// Mark a single notification as read
router.post('/:id/read', notificationCtrl.markAsRead);

// Mark all notifications as read
router.post('/read-all', notificationCtrl.markAllAsRead);

module.exports = router;

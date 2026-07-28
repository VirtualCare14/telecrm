const express = require('express');
const router = express.Router();
const agentCtrl = require('../controllers/agentController');
const { authenticate, authorizeRole } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const agentValidator = require('../validators/agent');

router.get('/active', authenticate, authorizeRole(['ADMIN', 'AGENT']), agentCtrl.getActiveAgents);

// Admin-only agent management
router.use(authenticate, authorizeRole(['ADMIN']));

router.get('/', agentCtrl.getAgents);
router.post('/', agentValidator.createAgent, validate, agentCtrl.createAgent);
router.get('/:id', agentCtrl.getAgent);
router.put('/:id', agentCtrl.updateAgent);
router.patch('/:id/status', agentCtrl.changeStatus);
router.patch('/:id/password', agentCtrl.changePassword);
router.post('/:id/force-logout', agentCtrl.forceLogout);

module.exports = router;

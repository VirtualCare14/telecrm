const express = require('express');
const router = express.Router();
const roleCtrl = require('../controllers/roleController');
const { authenticate, authorizeRole } = require('../middlewares/auth');

// Allow authenticated users to fetch roles for dropdown selection
router.get('/', authenticate, authorizeRole(['ADMIN', 'AGENT']), roleCtrl.getRoles);

// Admin-only role management
router.use(authenticate, authorizeRole(['ADMIN']));
router.post('/', roleCtrl.createRole);
router.put('/:id', roleCtrl.updateRole);
router.patch('/:id/status', roleCtrl.changeStatus);
router.delete('/:id', roleCtrl.deleteRole);

module.exports = router;

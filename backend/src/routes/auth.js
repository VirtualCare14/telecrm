const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/authController');
const { authenticate } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const authValidator = require('../validators/auth');

router.post('/login', authValidator.login, validate, authCtrl.login);
router.post('/refresh', authCtrl.refresh);
router.post('/logout', authenticate, authCtrl.logout);
router.get('/me', authenticate, authCtrl.me);

module.exports = router;

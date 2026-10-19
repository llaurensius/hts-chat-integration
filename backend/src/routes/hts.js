const express = require('express');
const router = express.Router();
const htsController = require('../controllers/htsController');
const { requireRole } = require('../middlewares/authMiddleware');

// Proteksi RBAC ketat (SEC-005): Hanya Dispatcher L1, Supervisor, dan Admin yang berwenang mengelola sesi portal HTS
router.use(requireRole(['ADMIN', 'SPV', 'L1']));

// Status koneksi HTS
router.get('/status', htsController.getStatus);

// Live Captcha stream
router.get('/captcha', htsController.getCaptcha);

// Login ke HTS
router.post('/login', htsController.postLogin);

// Master data dropdown HTS
router.get('/master-data', htsController.getMasterData);

// Logout HTS
router.post('/logout', htsController.postLogout);

module.exports = router;

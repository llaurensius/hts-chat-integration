const express = require('express');
const router = express.Router();
const settingController = require('../controllers/settingController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

// Proteksi khusus peran L1 sesuai kebutuhan bisnis
// Akses konfigurasi auto-reply untuk L1, SPV, dan Administrator
router.get('/autoreply', verifyToken, requireRole(['L1', 'ADMIN', 'SPV']), settingController.getAutoReplySetting);
router.put('/autoreply', verifyToken, requireRole(['L1', 'ADMIN', 'SPV']), settingController.updateAutoReplySetting);

module.exports = router;

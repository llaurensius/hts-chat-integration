const express = require('express');
const router = express.Router();
const settingController = require('../controllers/settingController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

// Proteksi khusus peran L1 sesuai kebutuhan bisnis
router.get('/autoreply', verifyToken, requireRole(['L1']), settingController.getAutoReplySetting);
router.put('/autoreply', verifyToken, requireRole(['L1']), settingController.updateAutoReplySetting);

module.exports = router;

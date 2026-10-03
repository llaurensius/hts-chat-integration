const express = require('express');
const router = express.Router();
const htsController = require('../controllers/htsController');

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

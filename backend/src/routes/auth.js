const express = require('express');
const router = express.Router();
const { login, getMe } = require('../controllers/authController');
const { verifyToken } = require('../middlewares/authMiddleware');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // Maksimal 10 percobaan login per IP per 15 menit
  message: { error: 'Terlalu banyak percobaan login yang gagal. Silakan coba kembali dalam 15 menit.' }
});

router.post('/login', loginLimiter, login);
router.get('/me', verifyToken, getMe);

module.exports = router;

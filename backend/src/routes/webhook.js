const express = require('express');
const router = express.Router();
const { handleIncomingMessage } = require('../controllers/webhookController');
const { verifyWebhookAuth } = require('../middlewares/webhookAuth');

// Body parser khusus webhook: batas 10MB (cukup untuk payload webhook berisi data image/base64, namun mencegah abuse memori)
router.use(express.json({ limit: '10mb' }));
router.use(express.urlencoded({ limit: '10mb', extended: true }));

// Menerima webhook event (POST /api/webhook/whatsapp) dengan autentikasi rahasia
router.post('/whatsapp', verifyWebhookAuth, handleIncomingMessage);

module.exports = router;



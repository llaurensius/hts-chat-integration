const express = require('express');
const router = express.Router();
const { handleIncomingMessage } = require('../controllers/webhookController');

// Menerima webhook event (POST /api/webhook/whatsapp)
router.post('/whatsapp', handleIncomingMessage);

module.exports = router;

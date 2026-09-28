const express = require('express');
const router = express.Router();
const { getTickets, getMessages, sendReply } = require('../controllers/chatController');

// Endpoint untuk Dashboard
router.get('/tickets', getTickets);
router.get('/tickets/:ticketId/messages', getMessages);
router.post('/send', sendReply);

module.exports = router;

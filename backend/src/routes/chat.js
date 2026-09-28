const express = require('express');
const router = express.Router();
const { getTickets, getMessages, sendReply, getDivisions, closeTicket } = require('../controllers/chatController');

// Endpoint untuk Dashboard
router.get('/tickets', getTickets);
router.get('/tickets/:ticketId/messages', getMessages);
router.post('/send', sendReply);
router.get('/divisions', getDivisions);
router.post('/tickets/:ticketId/close', closeTicket);

module.exports = router;

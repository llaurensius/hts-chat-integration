const express = require('express');
const router = express.Router();
const { getTickets, getMessages, sendReply, getCategorys, closeTicket, sendMedia, assignTicket, resolveTicket, returnTicket, addInternalNote, updateCustomer } = require('../controllers/chatController');
const { upload } = require('../utils/imageStorage'); // Gunakan imageStorage yang sudah benar

// Endpoint untuk Dashboard
router.get('/tickets', getTickets);
router.get('/tickets/:ticketId/messages', getMessages);
router.post('/send', sendReply);
router.post('/sendMedia', upload.single('media'), sendMedia);
router.get('/categories', getCategorys);
router.post('/tickets/:ticketId/close', closeTicket);
router.post('/tickets/:ticketId/assign', assignTicket);
router.post('/tickets/:ticketId/resolve', resolveTicket);
router.post('/tickets/:ticketId/return', returnTicket);
router.post('/tickets/:ticketId/internal-note', addInternalNote);
router.put('/customers/:customerId', updateCustomer);

module.exports = router;

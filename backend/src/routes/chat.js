const express = require('express');
const router = express.Router();
const { getTickets, getMessages, sendReply, getCategorys, closeTicket, sendMedia, assignTicket, resolveTicket, returnTicket, addInternalNote, updateCustomer, syncTicketToHts, syncSolveHts } = require('../controllers/chatController');
const { upload } = require('../utils/imageStorage'); // Gunakan imageStorage yang sudah benar

// Endpoint untuk Dashboard
router.get('/tickets', getTickets);
router.get('/tickets/:ticketId/messages', getMessages);
router.post('/send', sendReply);
router.post('/sendMedia', upload.single('media'), sendMedia);
router.get('/categories', getCategorys);
router.post('/tickets/:ticketId/close', upload.single('attachment'), closeTicket);
router.post('/tickets/:ticketId/assign', upload.single('attachment'), assignTicket);
router.post('/tickets/:ticketId/resolve', resolveTicket);
router.post('/tickets/:ticketId/return', returnTicket);
router.post('/tickets/:ticketId/internal-note', addInternalNote);
router.put('/customers/:customerId', updateCustomer);
router.post('/tickets/:ticketId/sync-hts', upload.single('attachment'), syncTicketToHts);
router.post('/tickets/:ticketId/sync-solve-hts', syncSolveHts);

module.exports = router;

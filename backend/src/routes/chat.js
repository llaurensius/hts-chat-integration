const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

const { getTickets, getMessages, sendReply, getCategories, closeTicket, sendMedia } = require('../controllers/chatController');

// Konfigurasi Multer (Penyimpanan sementara)
const upload = multer({ 
  dest: path.join(__dirname, '../../uploads/') 
});

// Endpoint untuk Dashboard
router.get('/tickets', getTickets);
router.get('/tickets/:ticketId/messages', getMessages);
router.post('/send', sendReply);
router.post('/sendMedia', upload.single('media'), sendMedia); // Endpoint Fase 3
router.get('/categories', getCategories);
router.post('/tickets/:ticketId/close', closeTicket);

module.exports = router;

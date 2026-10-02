const express = require('express');
const router = express.Router();
const { 
  getTickets, 
  getMessages, 
  sendReply, 
  getCategorys, 
  closeTicket, 
  sendMedia, 
  assignTicket, 
  resolveTicket, 
  returnTicket, 
  addInternalNote, 
  updateCustomer, 
  syncTicketToHts, 
  syncSolveHts,
  // Endpoint V4
  getTicketHtsList,
  createTicketHts,
  solveTicketHtsSingle,
  toggleAduan,
  closeGeneralChat,
  sendInternalMedia,
  getInternalMediaList,
  // Endpoint V4 Fase 3
  getCustomerHistoryMessages,
  fetchWaHistory,
  // Endpoint V4 Fase 5 (Quick Replies)
  getQuickReplies,
  createQuickReply,
  updateQuickReply,
  deleteQuickReply,
  // Endpoint V4 Fase 7 (Manual Link & Disaster Recovery HTS)
  linkHtsTicket,
  completeHtsPic,
  unlinkHtsTicket
} = require('../controllers/chatController');
const { upload } = require('../utils/imageStorage'); // Gunakan imageStorage yang sudah benar

// Endpoint untuk Dashboard
router.get('/tickets', getTickets);
router.get('/tickets/:ticketId/messages', getMessages);
router.post('/send', sendReply);
router.post('/sendMedia', upload.single('media'), sendMedia);
router.get('/categories', getCategorys);
router.post('/tickets/:ticketId/close', upload.array('attachment', 5), closeTicket);
router.post('/tickets/:ticketId/assign', upload.array('attachment', 5), assignTicket);
router.post('/tickets/:ticketId/resolve', resolveTicket);
router.post('/tickets/:ticketId/return', returnTicket);
router.post('/tickets/:ticketId/internal-note', addInternalNote);
router.put('/customers/:customerId', updateCustomer);
router.post('/tickets/:ticketId/sync-hts', upload.array('attachment', 5), syncTicketToHts);
router.post('/tickets/:ticketId/sync-solve-hts', syncSolveHts);

// Rute V4: Multi-HTS & Percakapan Biasa
router.get('/tickets/:ticketId/hts', getTicketHtsList);
router.post('/tickets/:ticketId/hts', upload.array('attachment', 5), createTicketHts);
router.post('/tickets/:ticketId/hts/:htsId/solve', upload.array('attachment', 5), solveTicketHtsSingle);
router.patch('/tickets/:ticketId/toggle-aduan', toggleAduan);
router.post('/tickets/:ticketId/close-general', closeGeneralChat);

// Rute V4 Fase 2: Catatan Internal Multimedia Dua Arah (L1 <-> L2)
router.post('/tickets/:ticketId/internal-media', upload.single('media'), sendInternalMedia);
router.get('/tickets/:ticketId/internal-media', getInternalMediaList);

// Rute V4 Fase 3: Timeline Divider Riwayat Lampau & Penarikan WA Lama
router.get('/customers/:customerId/history-messages', getCustomerHistoryMessages);
router.post('/customers/:customerId/fetch-wa-history', fetchWaHistory);

// Rute V4 Fase 5: Balasan Cepat (Quick Replies / Canned Responses)
router.get('/quick-replies', getQuickReplies);
router.post('/quick-replies', createQuickReply);
router.put('/quick-replies/:id', updateQuickReply);
router.delete('/quick-replies/:id', deleteQuickReply);

// Rute V4 Fase 7: Penautan Manual & Pemulihan Tiket HTS (Manual Link & Disaster Recovery)
router.post('/tickets/:ticketId/link-hts', linkHtsTicket);
router.post('/tickets/:ticketId/hts/:htsTicketId/complete-pic', completeHtsPic);
router.delete('/tickets/:ticketId/hts/:htsTicketId/unlink', unlinkHtsTicket);

module.exports = router;




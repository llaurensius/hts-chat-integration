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
  unlinkHtsTicket,
  searchPhoneContacts,
  startNewChat,
  reopenTicket
} = require('../controllers/chatController');
const { upload } = require('../utils/imageStorage'); // Gunakan imageStorage yang sudah benar
const { requireRole } = require('../middlewares/authMiddleware');

// Endpoint untuk Dashboard
router.get('/tickets', requireRole(['ADMIN', 'SPV', 'L1', 'L2']), getTickets);
router.get('/tickets/:ticketId/messages', requireRole(['ADMIN', 'SPV', 'L1', 'L2']), getMessages);
router.post('/send', requireRole(['ADMIN', 'SPV', 'L1']), sendReply);
router.post('/sendMedia', requireRole(['ADMIN', 'SPV', 'L1']), upload.single('media'), sendMedia);
router.get('/categories', requireRole(['ADMIN', 'SPV', 'L1', 'L2']), getCategorys);
router.post('/tickets/:ticketId/close', requireRole(['ADMIN', 'SPV', 'L1']), upload.any(), closeTicket);
router.post('/tickets/:ticketId/assign', requireRole(['ADMIN', 'SPV', 'L1']), upload.array('attachment', 5), assignTicket);
router.post('/tickets/:ticketId/resolve', requireRole(['ADMIN', 'SPV', 'L2']), resolveTicket);
router.post('/tickets/:ticketId/return', requireRole(['ADMIN', 'SPV', 'L2']), returnTicket);
router.post('/tickets/:ticketId/internal-note', requireRole(['ADMIN', 'SPV', 'L1', 'L2']), addInternalNote);
router.put('/customers/:customerId', requireRole(['ADMIN', 'SPV', 'L1']), updateCustomer);
router.post('/tickets/:ticketId/sync-hts', requireRole(['ADMIN', 'SPV', 'L1']), upload.array('attachment', 5), syncTicketToHts);
router.post('/tickets/:ticketId/sync-solve-hts', requireRole(['ADMIN', 'SPV', 'L1']), syncSolveHts);

// Rute V4: Multi-HTS & Percakapan Biasa
router.get('/tickets/:ticketId/hts', requireRole(['ADMIN', 'SPV', 'L1', 'L2']), getTicketHtsList);
router.post('/tickets/:ticketId/hts', requireRole(['ADMIN', 'SPV', 'L1']), upload.array('attachment', 5), createTicketHts);
router.post('/tickets/:ticketId/hts/:htsId/solve', requireRole(['ADMIN', 'SPV', 'L1']), upload.array('attachment', 5), solveTicketHtsSingle);
router.patch('/tickets/:ticketId/toggle-aduan', requireRole(['ADMIN', 'SPV', 'L1']), toggleAduan);
router.post('/tickets/:ticketId/close-general', requireRole(['ADMIN', 'SPV', 'L1']), closeGeneralChat);

// Rute V4 Fase 2: Catatan Internal Multimedia Dua Arah (L1 <-> L2)
router.post('/tickets/:ticketId/internal-media', requireRole(['ADMIN', 'SPV', 'L1', 'L2']), upload.single('media'), sendInternalMedia);
router.get('/tickets/:ticketId/internal-media', requireRole(['ADMIN', 'SPV', 'L1', 'L2']), getInternalMediaList);

// Rute V4 Fase 3: Timeline Divider Riwayat Lampau & Penarikan WA Lama
router.get('/customers/:customerId/history-messages', requireRole(['ADMIN', 'SPV', 'L1']), getCustomerHistoryMessages);
router.post('/customers/:customerId/fetch-wa-history', requireRole(['ADMIN', 'SPV', 'L1']), fetchWaHistory);

// Rute V4 Fase 5: Balasan Cepat (Quick Replies / Canned Responses)
router.get('/quick-replies', requireRole(['ADMIN', 'SPV', 'L1']), getQuickReplies);
router.post('/quick-replies', requireRole(['ADMIN', 'SPV', 'L1']), createQuickReply);
router.put('/quick-replies/:id', requireRole(['ADMIN', 'SPV', 'L1']), updateQuickReply);
router.delete('/quick-replies/:id', requireRole(['ADMIN', 'SPV', 'L1']), deleteQuickReply);

// Rute V4 Fase 7: Penautan Manual & Pemulihan Tiket HTS (Manual Link & Disaster Recovery)
router.post('/tickets/:ticketId/link-hts', requireRole(['ADMIN', 'SPV', 'L1']), linkHtsTicket);
router.post('/tickets/:ticketId/hts/:htsTicketId/complete-pic', requireRole(['ADMIN', 'SPV', 'L1']), completeHtsPic);
router.delete('/tickets/:ticketId/hts/:htsTicketId/unlink', requireRole(['ADMIN', 'SPV', 'L1']), unlinkHtsTicket);

// Rute Fitur Buku Kontak HP & Mulai Chat Baru (Outbound)
router.get('/contacts/search', requireRole(['ADMIN', 'SPV', 'L1']), searchPhoneContacts);
router.post('/start-new-chat', requireRole(['ADMIN', 'SPV', 'L1']), startNewChat);
router.post('/tickets/:ticketId/reopen', requireRole(['ADMIN', 'SPV', 'L1']), reopenTicket);

module.exports = router;




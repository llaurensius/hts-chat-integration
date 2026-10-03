const express = require('express');
const router = express.Router();
const { getTicketReports, deleteTicketReports } = require('../controllers/reportController');
const { requireRole } = require('../middlewares/authMiddleware');

// Endpoint untuk halaman Reporting Dashboard (Khusus ADMIN, SPV, dan L1)
router.get('/tickets', requireRole(['ADMIN', 'SPV', 'L1']), getTicketReports);

// Endpoint hapus tiket (Khusus ADMIN)
router.delete('/tickets', requireRole(['ADMIN']), deleteTicketReports);

module.exports = router;

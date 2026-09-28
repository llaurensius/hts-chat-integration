const express = require('express');
const router = express.Router();
const { getTicketReports, deleteTicketReports } = require('../controllers/reportController');
const { requireRole } = require('../middlewares/authMiddleware');

// Endpoint untuk halaman Reporting Dashboard
router.get('/tickets', getTicketReports);

// Endpoint hapus tiket (Khusus ADMIN)
router.delete('/tickets', requireRole(['ADMIN']), deleteTicketReports);

module.exports = router;

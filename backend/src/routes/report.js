const express = require('express');
const router = express.Router();
const { getTicketReports } = require('../controllers/reportController');

// Endpoint untuk halaman Reporting Dashboard
router.get('/tickets', getTicketReports);

module.exports = router;

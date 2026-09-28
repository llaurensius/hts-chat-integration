const prisma = require('../config/db');

// Mengambil data rekap tiket untuk laporan
const getTicketReports = async (req, res) => {
  try {
    const { status, startDate, endDate, divisionId } = req.query;
    
    // Bangun query filter secara dinamis
    let whereClause = {};
    
    if (status) {
      whereClause.status = status;
    }
    
    if (startDate && endDate) {
      whereClause.created_at = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    if (divisionId) {
      whereClause.divisions = {
        some: {
          division_id: parseInt(divisionId)
        }
      };
    }

    const tickets = await prisma.ticket.findMany({
      where: whereClause,
      include: {
        customer: true,
        divisions: {
          include: {
            division: true
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    // Formatting data agar lebih mudah dikonsumsi frontend
    const formattedTickets = tickets.map(t => {
      // Hitung durasi penanganan jika tiket sudah ditutup
      let durationStr = '-';
      if (t.closed_at) {
        const start = new Date(t.created_at).getTime();
        const end = new Date(t.closed_at).getTime();
        const diffMins = Math.round((end - start) / 60000);
        
        if (diffMins < 60) {
          durationStr = `${diffMins} Menit`;
        } else {
          const hours = Math.floor(diffMins / 60);
          const mins = diffMins % 60;
          durationStr = `${hours} Jam ${mins} Menit`;
        }
      }

      return {
        id: t.id,
        customerName: t.customer.name,
        waNumber: t.customer.wa_number,
        status: t.status,
        createdAt: t.created_at,
        closedAt: t.closed_at,
        duration: durationStr,
        summary: t.summary || '-',
        divisions: t.divisions.map(td => td.division.name).join(', ') || 'Belum di-tag'
      };
    });

    res.json(formattedTickets);
  } catch (error) {
    console.error('[Report API] Error fetching reports:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { getTicketReports };

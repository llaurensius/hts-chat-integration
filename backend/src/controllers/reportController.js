const prisma = require('../config/db');

// Mengambil data rekap tiket untuk laporan
const getTicketReports = async (req, res) => {
  try {
    const { status, startDate, endDate, categoryId } = req.query;
    
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

    if (categoryId) {
      whereClause.categories = {
        some: {
          category_id: parseInt(categoryId)
        }
      };
    }

    const tickets = await prisma.ticket.findMany({
      where: whereClause,
      include: {
        customer: true,
        categories: {
          include: {
            category: true
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

      const serviceTypeStr = t.service_type === 'REQUEST_LAYANAN' ? 'Request Layanan' : 
                             t.service_type === 'MONITORING' ? 'Monitoring' : 
                             t.service_type === 'TROUBLESHOOTING' ? 'Troubleshooting' : '-';

      return {
        id: t.id,
        customerName: t.customer.name,
        skpdName: t.customer.skpd_name || '-',
        waNumber: t.customer.wa_number,
        status: t.status,
        serviceType: serviceTypeStr,
        createdAt: t.created_at,
        closedAt: t.closed_at,
        duration: durationStr,
        summary: t.summary || '-',
        categories: t.categories.map(tc => tc.category.name).join(', ') || 'Belum di-assign',
        htsTicketNo: t.hts_ticket_no || null,
        htsTicketStatus: t.hts_ticket_status || null,
        htsSyncedAt: t.hts_synced_at || null
      };
    });

    res.json(formattedTickets);
  } catch (error) {
    console.error('[Report API] Error fetching reports:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Menghapus data tiket laporan (Khusus Admin)
const deleteTicketReports = async (req, res) => {
  const { ids, all } = req.body;

  try {
    if (all === true) {
      // Hapus SEMUA data testing: Message -> TicketCategory -> Ticket -> Customer
      // Dan reset sequence auto-increment ID kembali ke angka 1
      await prisma.$transaction(async (tx) => {
        await tx.message.deleteMany();
        await tx.ticketCategory.deleteMany();
        await tx.ticket.deleteMany();
        await tx.customer.deleteMany();
        await tx.$executeRawUnsafe(`ALTER SEQUENCE "Ticket_id_seq" RESTART WITH 1`);
        await tx.$executeRawUnsafe(`ALTER SEQUENCE "Message_id_seq" RESTART WITH 1`);
        await tx.$executeRawUnsafe(`ALTER SEQUENCE "Customer_id_seq" RESTART WITH 1`);
      });

      if (req.io) {
        req.io.emit('ticket_closed', { ticketId: 'all' });
      }

      return res.json({
        success: true,
        message: 'Seluruh data aduan, pesan, dan kontak pelanggan berhasil dihapus bersih, dan nomor ID di-reset kembali ke 1.'
      });
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Pilih minimal 1 tiket untuk dihapus' });
    }

    const ticketIds = ids.map(id => parseInt(id)).filter(id => !isNaN(id));

    // Hapus tiket-tiket terpilih secara aman
    await prisma.$transaction([
      prisma.message.deleteMany({
        where: { ticket_id: { in: ticketIds } }
      }),
      prisma.ticketCategory.deleteMany({
        where: { ticket_id: { in: ticketIds } }
      }),
      prisma.ticket.deleteMany({
        where: { id: { in: ticketIds } }
      })
    ]);

    if (req.io) {
      req.io.emit('ticket_closed', { ticketId: 'batch' });
    }

    res.json({
      success: true,
      message: `${ticketIds.length} data aduan terpilih berhasil dihapus.`
    });
  } catch (error) {
    console.error('[Report API] Error deleting reports:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { getTicketReports, deleteTicketReports };

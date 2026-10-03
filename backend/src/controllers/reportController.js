const prisma = require('../config/db');

// Mengambil data rekap tiket untuk laporan
const getTicketReports = async (req, res) => {
  try {
    const { status, startDate, endDate, categoryId, is_aduan, limit, page } = req.query;

    const take = limit ? Math.min(Math.max(parseInt(limit) || 50, 1), 200) : undefined;
    const skip = page && take ? Math.max((parseInt(page) - 1) * take, 0) : undefined;
    
    // Bangun query filter secara dinamis
    let whereClause = {};
    
    if (status) {
      whereClause.status = status;
    }

    if (is_aduan !== undefined) {
      whereClause.is_aduan = is_aduan === 'true' || is_aduan === true;
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
      ...(take !== undefined && { take }),
      ...(skip !== undefined && { skip }),
      include: {
        customer: true,
        messages: {
          select: {
            created_at: true,
            sender_type: true
          },
          orderBy: { created_at: 'asc' }
        },
        categories: {
          include: {
            category: true
          }
        },
        hts_tickets: {
          include: {
            category: true
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    // Formatting data agar lebih mudah dikonsumsi frontend
    const formattedTickets = tickets.map(t => {
      const isAduan = t.is_aduan !== false;

      // 1. Hitung First Response Time (FRT)
      let frtStr = '-';
      let frtMins = null;
      if (t.messages && t.messages.length > 0) {
        const firstCustomerMsg = t.messages.find(m => m.sender_type === 'CUSTOMER');
        if (firstCustomerMsg) {
          const firstAgentMsg = t.messages.find(m => 
            m.sender_type === 'AGENT' && new Date(m.created_at) >= new Date(firstCustomerMsg.created_at)
          );
          if (firstAgentMsg) {
            const customerTime = new Date(firstCustomerMsg.created_at).getTime();
            const agentTime = new Date(firstAgentMsg.created_at).getTime();
            frtMins = Math.max(0, Math.round((agentTime - customerTime) / 60000));
            if (frtMins < 60) {
              frtStr = `${frtMins} Menit`;
            } else {
              const hours = Math.floor(frtMins / 60);
              const mins = frtMins % 60;
              frtStr = `${hours} Jam ${mins} Menit`;
            }
          }
        }
      }

      // 2. Hitung MTTR (Mean Time to Resolve)
      // CATATAN KRUSIAL: Percakapan biasa (is_aduan = false) 100% DIKECUALIKAN dari MTTR teknis!
      let durationStr = '-';
      let durationMins = null;
      if (!isAduan) {
        durationStr = 'N/A (Percakapan Biasa)';
        durationMins = null;
      } else if (t.closed_at) {
        const start = new Date(t.created_at).getTime();
        const end = new Date(t.closed_at).getTime();
        durationMins = Math.round((end - start) / 60000);
        
        if (durationMins < 60) {
          durationStr = `${durationMins} Menit`;
        } else {
          const hours = Math.floor(durationMins / 60);
          const mins = durationMins % 60;
          durationStr = `${hours} Jam ${mins} Menit`;
        }
      }

      const serviceTypeStr = t.service_type === 'REQUEST_LAYANAN' ? 'Request Layanan' : 
                             t.service_type === 'MONITORING' ? 'Monitoring' : 
                             t.service_type === 'GENERAL_CHAT' ? 'Percakapan Biasa' : 
                             t.service_type === 'TROUBLESHOOTING' ? 'Troubleshooting' : 
                             (!isAduan ? 'Percakapan Biasa' : 'Aduan Teknis');

      const multiHtsNos = t.hts_tickets && t.hts_tickets.length > 0 
        ? t.hts_tickets.map(h => `#${h.hts_ticket_no} (${h.hts_ticket_status})`).join(', ')
        : (t.hts_ticket_no || null);

      return {
        id: t.id,
        customerName: t.customer.name,
        skpdName: t.customer.skpd_name || '-',
        waNumber: t.customer.wa_number,
        status: t.status,
        isAduan: isAduan,
        serviceType: serviceTypeStr,
        createdAt: t.created_at,
        closedAt: t.closed_at,
        frt: frtStr,
        frtMins: frtMins,
        duration: durationStr,
        durationMins: durationMins,
        summary: t.summary || '-',
        categories: t.categories.map(tc => tc.category.name).join(', ') || (isAduan ? 'Belum di-assign' : '-'),
        htsTicketNo: multiHtsNos,
        htsTicketStatus: t.hts_ticket_status || null,
        htsSyncedAt: t.hts_synced_at || null,
        htsTickets: t.hts_tickets || []
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

const prisma = require('../config/db');
const evolutionService = require('../services/evolutionService');

// Mengambil semua tiket aktif beserta pesan terakhirnya
const getTickets = async (req, res) => {
  try {
    const tickets = await prisma.ticket.findMany({
      where: { status: 'OPEN' },
      include: {
        customer: true,
        messages: {
          orderBy: { created_at: 'desc' },
          take: 1 // Ambil 1 pesan terakhir untuk preview (snippet)
        }
      },
      orderBy: { created_at: 'desc' }
    });
    res.json(tickets);
  } catch (error) {
    console.error('[Chat API] Error fetching tickets:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Mengambil riwayat percakapan untuk satu tiket spesifik
const getMessages = async (req, res) => {
  const { ticketId } = req.params;
  try {
    const messages = await prisma.message.findMany({
      where: { ticket_id: parseInt(ticketId) },
      orderBy: { created_at: 'asc' } // Urutkan dari terlama ke terbaru
    });
    res.json(messages);
  } catch (error) {
    console.error('[Chat API] Error fetching messages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Agen membalas pesan ke Customer
const sendReply = async (req, res) => {
  const { ticketId, text } = req.body; 
  // Gunakan ID dari token JWT jika middleware diaktifkan, jika tidak fallback ke req.body.userId
  const userId = req.user ? req.user.id : req.body.userId;

  if (!ticketId || !text) {
    return res.status(400).json({ error: 'ticketId dan text wajib diisi' });
  }

  try {
    // 1. Cari tiket dan wa_number pelapor
    const ticket = await prisma.ticket.findUnique({
      where: { id: parseInt(ticketId) },
      include: { customer: true }
    });

    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const waNumber = ticket.customer.wa_number;

    // 2. Kirim balasan via Evolution API ke WhatsApp Pelapor
    await evolutionService.sendText(waNumber, text);

    // 3. Simpan riwayat balasan agen ke Database
    const savedMessage = await prisma.message.create({
      data: {
        ticket_id: ticket.id,
        sender_type: 'AGENT',
        sender_id: userId || null, // Sesuai dengan field di schema.prisma
        message_text: text
      }
    });

    // 4. Broadcast via Socket.io agar UI Agen/SPV lain langsung terupdate
    if (req.io) {
      req.io.emit('new_message', {
        ticketId: ticket.id,
        waNumber: waNumber,
        senderName: 'Agent',
        text: text,
        createdAt: savedMessage.created_at,
        senderType: 'AGENT'
      });
    }

    res.json({ success: true, message: savedMessage });
  } catch (error) {
    console.error('[Chat API] Error sending reply:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Mengambil daftar divisi untuk Multi-Tagging (F3)
const getCategorys = async (req, res) => {
  try {
    const categorys = await prisma.category.findMany();
    res.json(categorys);
  } catch (error) {
    console.error('[Chat API] Error fetching categorys:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Menutup Tiket dengan Mandatory Summary (F7) dan Multi-Tagging (F3)
const closeTicket = async (req, res) => {
  const { ticketId } = req.params;
  const { summary, categoryIds } = req.body;

  if (!summary || summary.trim().length < 10) {
    return res.status(400).json({ error: 'Kesimpulan wajib diisi minimal 10 karakter' });
  }

  try {
    // Update tiket
    const updatedTicket = await prisma.ticket.update({
      where: { id: parseInt(ticketId) },
      data: {
        status: 'CLOSED',
        summary: summary.trim(),
        closed_at: new Date()
      }
    });

    // Handle Multi-Tagging (F3) ke tabel TicketCategory
    if (categoryIds && Array.isArray(categoryIds) && categoryIds.length > 0) {
      const categoryData = categoryIds.map(divId => ({
        ticket_id: updatedTicket.id,
        category_id: parseInt(divId)
      }));
      await prisma.ticketCategory.createMany({
        data: categoryData,
        skipDuplicates: true
      });
    }

    // Blast Notifikasi via Socket.io (F4) - Kasih tahu semua klien bahwa tiket diclose/diupdate
    if (req.io) {
      req.io.emit('ticket_closed', {
        ticketId: updatedTicket.id,
        summary: updatedTicket.summary,
        categorys: categoryIds
      });
    }

    res.json({ success: true, ticket: updatedTicket });
  } catch (error) {
    console.error('[Chat API] Error closing ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { getTickets, getMessages, sendReply, getCategorys, closeTicket };

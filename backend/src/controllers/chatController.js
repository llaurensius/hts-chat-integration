const prisma = require('../config/db');
const evolutionService = require('../services/evolutionService');

// Mengambil semua tiket aktif beserta pesan terakhirnya
const getTickets = async (req, res) => {
  try {
    // Filter tiket berdasarkan peran
    // L1 / Admin / SPV melihat semua tiket OPEN dan RESOLVED
    // L2 HANYA melihat tiket OPEN dan RESOLVED yang di-assign ke kategorinya
    let whereClause = { status: { in: ['OPEN', 'RESOLVED'] } };

    if (req.user && req.user.role === 'L2' && req.user.category_id) {
      whereClause.categories = {
        some: {
          category_id: req.user.category_id
        }
      };
    }

    const tickets = await prisma.ticket.findMany({
      where: whereClause,
      include: {
        customer: true,
        categories: {
          include: { category: true }
        },
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

// Mengirim Media (Gambar/Dokumen) ke WA Pelapor (Fase 3)
const sendMedia = async (req, res) => {
  try {
    const { ticketId, caption } = req.body;
    const file = req.file;
    const userId = req.user ? req.user.id : (req.body.userId || 1);

    if (!ticketId || !file) {
      return res.status(400).json({ error: 'Ticket ID dan File gambar wajib dikirim' });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: parseInt(ticketId) },
      include: { customer: true }
    });

    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    
    const waNumber = ticket.customer.wa_number;

    // FASE 3: Integrasi API Evolution untuk Kirim Media
    const evolutionApiUrl = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
    const evolutionApiKey = process.env.EVOLUTION_API_TOKEN || 'SecureTokenUntukBackend123';
    const instanceName = process.env.EVOLUTION_INSTANCE_NAME || 'helpdesk-wa';

    // Konversi file ke base64
    const fs = require('fs');
    const base64Data = fs.readFileSync(file.path, { encoding: 'base64' });

    const axios = require('axios');
    const payload = {
      number: waNumber,
      options: {
        delay: 1200,
        presence: "composing"
      },
      mediatype: "image",
      caption: caption || "",
      media: base64Data
    };

    try {
      await axios.post(`${evolutionApiUrl}/message/sendMedia/${instanceName}`, payload, {
        headers: {
          'apikey': evolutionApiKey,
          'Content-Type': 'application/json'
        }
      });
    } catch (evoError) {
      console.error('[Evolution API] Failed to send WA Media:', evoError?.response?.data || evoError.message);
    }

    
    const publicUrl = `/uploads/${file.filename}`;


    const savedMessage = await prisma.message.create({
      data: {
        ticket_id: ticket.id,
        sender_type: 'AGENT',
        sender_id: userId,
        message_text: caption || '[Mengirim Gambar]',
        attachment_url: publicUrl
      }
    });

    if (req.io) {
      req.io.emit('new_message', {
        ticketId: ticket.id,
        waNumber: waNumber,
        senderName: 'Agent',
        text: savedMessage.message_text,
        attachmentUrl: publicUrl,
        createdAt: savedMessage.created_at,
        senderType: 'AGENT'
      });
    }

    res.json({ success: true, message: savedMessage });
  } catch (error) {
    console.error('[Chat API] Error sending media:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Assign Tiket ke L2 & Kirim Blast Notifikasi (Fase 5)
const assignTicket = async (req, res) => {
  const { ticketId } = req.params;
  const { categoryId } = req.body;

  if (!categoryId) {
    return res.status(400).json({ error: 'ID Kategori wajib dipilih' });
  }

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: parseInt(ticketId) },
      include: { customer: true }
    });

    if (!ticket) return res.status(404).json({ error: 'Tiket tidak ditemukan' });

    const category = await prisma.category.findUnique({
      where: { id: parseInt(categoryId) }
    });

    if (!category) return res.status(404).json({ error: 'Kategori tidak ditemukan' });

    // Hapus tagging lama jika ada, lalu set yang baru
    await prisma.ticketCategory.deleteMany({
      where: { ticket_id: ticket.id }
    });
    
    await prisma.ticketCategory.create({
      data: {
        ticket_id: ticket.id,
        category_id: category.id
      }
    });

    // Buat Internal Note otomatis bahwa tiket ini di-assign
    const noteText = `[SISTEM] Tiket di-assign ke L2: Kategori ${category.name}`;
    await prisma.message.create({
      data: {
        ticket_id: ticket.id,
        sender_type: 'AGENT',
        sender_id: req.user ? req.user.id : 1,
        message_text: noteText,
        is_internal: true
      }
    });

    // Blast Notifikasi WA ke L2 via Evolution API
    if (category.wa_target_number) {
      const evolutionApiUrl = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
      const evolutionApiKey = process.env.EVOLUTION_API_TOKEN || 'SecureTokenUntukBackend123';
      const instanceName = process.env.EVOLUTION_INSTANCE_NAME || 'helpdesk-wa';
      
      const dashboardUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const blastMessage = `🚨 *TUGAS BARU (L2)*\n\nKategori: ${category.name}\nPelapor: ${ticket.customer.name}\n\nSilakan cek detail dan tangani melalui dashboard:\n${dashboardUrl}`;
      
      try {
        const axios = require('axios');
        await axios.post(`${evolutionApiUrl}/message/sendText/${instanceName}`, {
          number: category.wa_target_number,
          text: blastMessage
        }, {
          headers: {
            'apikey': evolutionApiKey,
            'Content-Type': 'application/json'
          }
        });
        console.log(`[Blast] Sent L2 notification to ${category.wa_target_number}`);
      } catch (evoError) {
        console.error('[Evolution API] Failed to send L2 blast:', evoError?.response?.data || evoError.message);
      }
    }

    if (req.io) {
      req.io.emit('ticket_closed', { ticketId: ticket.id }); // Reuse event 'ticket_closed' for re-fetching
      req.io.emit('new_message', {
        ticketId: ticket.id,
        senderType: 'AGENT',
        text: noteText,
        isInternal: true,
        createdAt: new Date().toISOString()
      });
    }

    res.json({ success: true, message: 'Tiket berhasil di-assign dan teknisi telah dinotifikasi.' });
  } catch (error) {
    console.error('[Chat API] Error assigning ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// L2 Menandai Tiket Selesai (Fase 6)
const resolveTicket = async (req, res) => {
  const { ticketId } = req.params;
  try {
    const updatedTicket = await prisma.ticket.update({
      where: { id: parseInt(ticketId) },
      data: { status: 'RESOLVED' }
    });

    const noteText = `[SISTEM] Teknisi L2 telah menandai pekerjaan selesai. Menunggu penutupan final oleh L1.`;
    await prisma.message.create({
      data: {
        ticket_id: updatedTicket.id,
        sender_type: 'AGENT',
        sender_id: req.user ? req.user.id : 1,
        message_text: noteText,
        is_internal: true
      }
    });

    if (req.io) {
      req.io.emit('ticket_closed', { ticketId: updatedTicket.id }); // Trigger reload
      req.io.emit('new_message', {
        ticketId: updatedTicket.id,
        senderType: 'AGENT',
        text: noteText,
        isInternal: true,
        createdAt: new Date().toISOString()
      });
    }

    res.json({ success: true, ticket: updatedTicket });
  } catch (error) {
    console.error('[Chat API] Error resolving ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// L2 Mengembalikan Tiket ke L1 (Fase 6)
const returnTicket = async (req, res) => {
  const { ticketId } = req.params;
  try {
    const updatedTicket = await prisma.ticket.update({
      where: { id: parseInt(ticketId) },
      data: { status: 'OPEN' }
    });

    // Menghapus mapping kategori agar kembali ke antrean umum L1
    await prisma.ticketCategory.deleteMany({
      where: { ticket_id: updatedTicket.id }
    });

    const noteText = `[SISTEM] Teknisi L2 mengembalikan tiket ini ke L1 (Salah Kategori / Butuh Info).`;
    await prisma.message.create({
      data: {
        ticket_id: updatedTicket.id,
        sender_type: 'AGENT',
        sender_id: req.user ? req.user.id : 1,
        message_text: noteText,
        is_internal: true
      }
    });

    if (req.io) {
      req.io.emit('ticket_closed', { ticketId: updatedTicket.id });
      req.io.emit('new_message', {
        ticketId: updatedTicket.id,
        senderType: 'AGENT',
        text: noteText,
        isInternal: true,
        createdAt: new Date().toISOString()
      });
    }

    res.json({ success: true, ticket: updatedTicket });
  } catch (error) {
    console.error('[Chat API] Error returning ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// L2 Menambahkan Catatan Internal (Fase Tambahan V2)
const addInternalNote = async (req, res) => {
  const { ticketId } = req.params;
  const { text } = req.body;
  
  if (!text) return res.status(400).json({ error: 'Catatan tidak boleh kosong' });

  try {
    const savedMessage = await prisma.message.create({
      data: {
        ticket_id: parseInt(ticketId),
        sender_type: 'AGENT',
        sender_id: req.user ? req.user.id : 1,
        message_text: text,
        is_internal: true
      }
    });

    if (req.io) {
      req.io.emit('new_message', {
        ticketId: parseInt(ticketId),
        senderType: 'AGENT',
        text: text,
        isInternal: true,
        createdAt: savedMessage.created_at
      });
    }

    res.json({ success: true, message: savedMessage });
  } catch (error) {
    console.error('[Chat API] Error adding internal note:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { getTickets, getMessages, sendReply, getCategorys, closeTicket, sendMedia, assignTicket, resolveTicket, returnTicket, addInternalNote };

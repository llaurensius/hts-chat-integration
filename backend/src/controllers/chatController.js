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
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            role: true,
            category: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      },
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
    if (categoryIds && Array.isArray(categoryIds)) {
      const parsedCatIds = categoryIds.map(divId => parseInt(divId)).filter(id => !isNaN(id));
      
      // Hapus kategori yang tidak ada dalam seleksi akhir L1
      await prisma.ticketCategory.deleteMany({
        where: {
          ticket_id: updatedTicket.id,
          category_id: { notIn: parsedCatIds }
        }
      });

      // Tambahkan kategori baru jika ada yang baru dipilih saat close
      if (parsedCatIds.length > 0) {
        await prisma.ticketCategory.createMany({
          data: parsedCatIds.map(catId => ({
            ticket_id: updatedTicket.id,
            category_id: catId,
            is_resolved: true
          })),
          skipDuplicates: true
        });

        // Tandai seluruh kategori tiket ini selesai (is_resolved = true)
        await prisma.ticketCategory.updateMany({
          where: { ticket_id: updatedTicket.id },
          data: { is_resolved: true, resolved_at: new Date() }
        });
      }
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

// Assign Tiket ke Satu atau Banyak L2 (Multi-Assign) & Kirim Blast Notifikasi
const assignTicket = async (req, res) => {
  const { ticketId } = req.params;
  const { categoryIds, categoryId, serviceType } = req.body;

  // Mendukung array categoryIds (Multi-Assign) maupun single categoryId
  let targetIds = [];
  if (Array.isArray(categoryIds) && categoryIds.length > 0) {
    targetIds = categoryIds.map(id => parseInt(id)).filter(id => !isNaN(id));
  } else if (categoryId) {
    targetIds = [parseInt(categoryId)];
  }

  if (targetIds.length === 0) {
    return res.status(400).json({ error: 'Minimal pilih 1 Tim L2 tujuan' });
  }

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: parseInt(ticketId) },
      include: { customer: true }
    });

    if (!ticket) return res.status(404).json({ error: 'Tiket tidak ditemukan' });

    const categories = await prisma.category.findMany({
      where: { id: { in: targetIds } },
      include: { contacts: true }
    });

    if (categories.length === 0) return res.status(404).json({ error: 'Tim kategori tidak ditemukan' });

    // 1. Ambil relasi penugasan tim yang sudah ada pada tiket ini
    const existingRelations = await prisma.ticketCategory.findMany({
      where: { ticket_id: ticket.id },
      include: { category: true }
    });
    const existingCatIds = existingRelations.map(r => r.category_id);

    // Kategori yang baru ditugaskan (belum ada sebelumnya)
    const newCatIds = targetIds.filter(id => !existingCatIds.includes(id));
    // Kategori yang dilepas oleh L1 (sebelumnya ada, sekarang di-uncheck)
    const removedCatIds = existingCatIds.filter(id => !targetIds.includes(id));

    // Update service type jika diberikan
    let serviceTypeStr = serviceType || ticket.service_type || 'TROUBLESHOOTING';
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        service_type: serviceTypeStr,
        status: 'OPEN' // Reset ke OPEN jika sebelumnya RESOLVED
      }
    });

    // Lepas hanya kategori yang di-uncheck
    if (removedCatIds.length > 0) {
      await prisma.ticketCategory.deleteMany({
        where: {
          ticket_id: ticket.id,
          category_id: { in: removedCatIds }
        }
      });
    }

    // Tambahkan hanya kategori baru (tim yang sudah ada sebelumnya status is_resolved-nya dipertahankan)
    if (newCatIds.length > 0) {
      await prisma.ticketCategory.createMany({
        data: newCatIds.map(catId => ({
          ticket_id: ticket.id,
          category_id: catId,
          is_resolved: false
        }))
      });
    }

    // Format nama tim untuk log & notifikasi
    const typeDisplay = serviceTypeStr === 'REQUEST_LAYANAN' ? 'Request Layanan' : 
                        serviceTypeStr === 'MONITORING' ? 'Monitoring' : 'Troubleshooting';
    
    const newCategories = categories.filter(c => newCatIds.includes(c.id));
    const removedCategories = existingRelations.filter(r => removedCatIds.includes(r.category_id)).map(r => r.category);
    const allActiveCategories = await prisma.ticketCategory.findMany({
      where: { ticket_id: ticket.id },
      include: { category: true }
    });
    const allActiveTeamNames = allActiveCategories.map(r => r.category.name).join(', ');

    // Buat Internal Note otomatis yang informatif
    let noteText = '';
    if (existingCatIds.length === 0) {
      noteText = `[SISTEM] Tiket di-assign ke L2: Tim ${allActiveTeamNames} | Jenis: ${typeDisplay}`;
    } else if (newCatIds.length > 0 && removedCatIds.length > 0) {
      const addedNames = newCategories.map(c => c.name).join(', ');
      const removedNames = removedCategories.map(c => c.name).join(', ');
      noteText = `[SISTEM] Penugasan tim diperbarui oleh L1: Ditambahkan ke Tim ${addedNames}, dilepas dari Tim ${removedNames}. Tim aktif saat ini: ${allActiveTeamNames} | Jenis: ${typeDisplay}`;
    } else if (newCatIds.length > 0) {
      const addedNames = newCategories.map(c => c.name).join(', ');
      noteText = `[SISTEM] Tim tambahan ditugaskan oleh L1: Tim ${addedNames}. Tim aktif saat ini: ${allActiveTeamNames} | Jenis: ${typeDisplay}`;
    } else if (removedCatIds.length > 0) {
      const removedNames = removedCategories.map(c => c.name).join(', ');
      noteText = `[SISTEM] Tim dilepas dari penugasan oleh L1: Tim ${removedNames}. Tim aktif saat ini: ${allActiveTeamNames} | Jenis: ${typeDisplay}`;
    } else {
      noteText = `[SISTEM] Data penugasan diperbarui oleh L1: Tim ${allActiveTeamNames} | Jenis: ${typeDisplay}`;
    }

    await prisma.message.create({
      data: {
        ticket_id: ticket.id,
        sender_type: 'AGENT',
        sender_id: req.user ? req.user.id : 1,
        message_text: noteText,
        is_internal: true
      }
    });

    // Blast Notifikasi WA HANYA ke tim yang BARU ditugaskan (newCategories)
    // agar tim yang sudah ditugaskan sebelumnya tidak menerima spam notifikasi berulang
    const evolutionApiUrl = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
    const evolutionApiKey = process.env.EVOLUTION_API_TOKEN || 'SecureTokenUntukBackend123';
    const instanceName = process.env.EVOLUTION_INSTANCE_NAME || 'helpdesk-wa';
    const hostHeader = req.headers.host || 'localhost:5173';
    const dashboardUrl = hostHeader.includes(':') ? `http://${hostHeader.split(':')[0]}:5173` : `http://${hostHeader}:5173`;

    const axios = require('axios');
    for (const cat of newCategories) {
      const blastMessage = `🚨 *TUGAS BARU DARI HELPDESK (L2)* 🚨\n\n*Tim:* ${cat.name}\n*Jenis Layanan:* ${typeDisplay}\n*Pelapor:* ${ticket.customer.name}\n*No WA:* ${ticket.customer.wa_number}\n\nSilakan cek detail percakapan dan berikan catatan internal melalui dashboard:\n${dashboardUrl}`;

      // Ambil seluruh target WA dari CategoryContact (Multi-Kontak)
      const targets = [];
      if (cat.contacts && cat.contacts.length > 0) {
        cat.contacts.forEach(c => {
          if (c.wa_target && !targets.includes(c.wa_target)) {
            targets.push(c.wa_target);
          }
        });
      }
      // Fallback ke wa_target_number legacy jika belum ada contacts
      if (targets.length === 0 && cat.wa_target_number) {
        targets.push(cat.wa_target_number);
      }

      for (const targetNumber of targets) {
        try {
          await axios.post(`${evolutionApiUrl}/message/sendText/${instanceName}`, {
            number: targetNumber,
            text: blastMessage
          }, {
            headers: {
              'apikey': evolutionApiKey,
              'Content-Type': 'application/json'
            }
          });
          console.log(`[Blast] Sent L2 notification to ${cat.name} target: ${targetNumber}`);
        } catch (evoError) {
          console.error(`[Evolution API] Failed to send blast to ${cat.name} (${targetNumber}):`, evoError?.response?.data || evoError.message);
        }
      }
    }

    if (req.io) {
      req.io.emit('ticket_closed', { ticketId: ticket.id }); // Trigger reload
      req.io.emit('new_message', {
        ticketId: ticket.id,
        senderType: 'AGENT',
        text: noteText,
        isInternal: true,
        createdAt: new Date().toISOString()
      });
    }

    res.json({ success: true, message: `Tiket berhasil di-assign ke Tim: ${allActiveTeamNames}` });
  } catch (error) {
    console.error('[Chat API] Error assigning ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// L2 Menandai Tiket Selesai (Fase 6)
const resolveTicket = async (req, res) => {
  const { ticketId } = req.params;
  const user = req.user;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: parseInt(ticketId) },
      include: {
        categories: {
          include: { category: true }
        }
      }
    });

    if (!ticket) return res.status(404).json({ error: 'Tiket tidak ditemukan' });

    let noteText = '';
    let isFullyResolved = false;

    // Jika yang resolve adalah L2 dengan kategori tertentu
    if (user && user.role === 'L2' && user.category_id) {
      const myCatRelation = ticket.categories.find(c => c.category_id === user.category_id);
      
      if (!myCatRelation) {
        return res.status(403).json({ error: 'Tim Anda tidak ditugaskan pada tiket ini' });
      }

      // Update status is_resolved untuk kategori tim user ini
      await prisma.ticketCategory.update({
        where: {
          ticket_id_category_id: {
            ticket_id: ticket.id,
            category_id: user.category_id
          }
        },
        data: {
          is_resolved: true,
          resolved_at: new Date()
        }
      });

      const catName = myCatRelation.category.name;
      noteText = `[SISTEM] Tim ${catName} telah menandai kendala di bagiannya selesai.`;

      // Cek apakah SEMUA tim yang ditugaskan sudah is_resolved = true
      const updatedCategories = await prisma.ticketCategory.findMany({
        where: { ticket_id: ticket.id }
      });

      const allResolved = updatedCategories.every(c => c.is_resolved);
      if (allResolved && updatedCategories.length > 0) {
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: { status: 'RESOLVED' }
        });
        isFullyResolved = true;
        noteText += ` Seluruh tim telah selesai menangani. Tiket berstatus RESOLVED (siap ditutup resmi oleh L1).`;
      }
    } else {
      // Jika Admin / SPV yang resolve langsung
      await prisma.ticketCategory.updateMany({
        where: { ticket_id: ticket.id },
        data: {
          is_resolved: true,
          resolved_at: new Date()
        }
      });
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { status: 'RESOLVED' }
      });
      isFullyResolved = true;
      noteText = `[SISTEM] Tiket ditandai selesai langsung oleh ${user?.name || 'Admin'}. Menunggu penutupan resmi oleh L1.`;
    }

    // Catat internal note
    await prisma.message.create({
      data: {
        ticket_id: ticket.id,
        sender_type: 'AGENT',
        sender_id: user ? user.id : 1,
        message_text: noteText,
        is_internal: true
      }
    });

    if (req.io) {
      req.io.emit('ticket_closed', { ticketId: ticket.id });
      req.io.emit('new_message', {
        ticketId: ticket.id,
        senderType: 'AGENT',
        text: noteText,
        isInternal: true,
        createdAt: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      isFullyResolved,
      message: noteText
    });
  } catch (error) {
    console.error('[Chat API] Error resolving ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// L2 Mengembalikan Tiket ke L1 (Fase 6)
const returnTicket = async (req, res) => {
  const { ticketId } = req.params;
  const { reason } = req.body;
  const user = req.user;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: parseInt(ticketId) },
      include: {
        categories: {
          include: { category: true }
        }
      }
    });

    if (!ticket) return res.status(404).json({ error: 'Tiket tidak ditemukan' });

    let noteText = '';
    const returnReason = reason && reason.trim() ? reason.trim() : 'Tidak ada kendala pada tim ini / Salah penugasan';

    if (user && user.role === 'L2' && user.category_id) {
      const myCatRelation = ticket.categories.find(c => c.category_id === user.category_id);
      
      if (!myCatRelation) {
        return res.status(403).json({ error: 'Tim Anda tidak terdaftar pada penugasan tiket ini' });
      }

      // Hapus hanya relasi tim user ini dari tiket
      await prisma.ticketCategory.delete({
        where: {
          ticket_id_category_id: {
            ticket_id: ticket.id,
            category_id: user.category_id
          }
        }
      });

      const catName = myCatRelation.category.name;
      noteText = `[SISTEM] Tim ${catName} melepas penugasan / mengembalikan ke L1. Catatan: "${returnReason}"`;

      // Cek sisa tim yang masih ditugaskan pada tiket ini
      const remainingCategories = await prisma.ticketCategory.findMany({
        where: { ticket_id: ticket.id }
      });

      if (remainingCategories.length === 0) {
        // Jika tidak ada tim tersisa sama sekali, tiket berstatus OPEN dan unassigned
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: { status: 'OPEN' }
        });
        noteText += ` (Semua tim telah dilepas, tiket kembali berstatus Belum Ditugaskan).`;
      } else {
        // Jika masih ada tim lain, periksa apakah sisa tim tersebut semuanya sudah selesai
        const allRemainingResolved = remainingCategories.every(c => c.is_resolved);
        if (allRemainingResolved) {
          await prisma.ticket.update({
            where: { id: ticket.id },
            data: { status: 'RESOLVED' }
          });
        }
      }
    } else {
      // Jika Admin yang mereturn semua
      await prisma.ticketCategory.deleteMany({
        where: { ticket_id: ticket.id }
      });
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { status: 'OPEN' }
      });
      noteText = `[SISTEM] Seluruh penugasan tim pada tiket ini telah dikembalikan ke L1 oleh ${user?.name || 'Admin'}. Catatan: "${returnReason}"`;
    }

    // Catat internal note
    await prisma.message.create({
      data: {
        ticket_id: ticket.id,
        sender_type: 'AGENT',
        sender_id: user ? user.id : 1,
        message_text: noteText,
        is_internal: true
      }
    });

    if (req.io) {
      req.io.emit('ticket_closed', { ticketId: ticket.id });
      req.io.emit('new_message', {
        ticketId: ticket.id,
        senderType: 'AGENT',
        text: noteText,
        isInternal: true,
        createdAt: new Date().toISOString()
      });
    }

    res.json({ success: true, message: noteText });
  } catch (error) {
    console.error('[Chat API] Error returning ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// L2 Menambahkan Catatan Internal (Fase Tambahan V2)
const addInternalNote = async (req, res) => {
  const { ticketId } = req.params;
  const { text } = req.body;
  
  if (!text || !text.trim()) return res.status(400).json({ error: 'Catatan tidak boleh kosong' });

  try {
    const savedMessage = await prisma.message.create({
      data: {
        ticket_id: parseInt(ticketId),
        sender_type: 'AGENT',
        sender_id: req.user ? req.user.id : null,
        message_text: text.trim(),
        is_internal: true
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            role: true,
            category: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });

    if (req.io) {
      req.io.emit('new_message', {
        ticketId: parseInt(ticketId),
        senderType: 'AGENT',
        text: text.trim(),
        isInternal: true,
        sender: savedMessage.sender,
        createdAt: savedMessage.created_at
      });
    }

    res.json({ success: true, message: savedMessage });
  } catch (error) {
    console.error('[Chat API] Error adding internal note:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Memperbarui Identitas Pelapor (Nama & Instansi/SKPD) - Khusus L1 dan ADMIN
const updateCustomer = async (req, res) => {
  const { customerId } = req.params;
  const { name, skpd_name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nama pelapor tidak boleh kosong' });
  }

  // Hak akses: L1, ADMIN, SPV
  if (req.user && !['L1', 'ADMIN', 'SPV'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Hanya L1 dan Admin yang memiliki izin mengubah nama pelapor' });
  }

  try {
    const updatedCustomer = await prisma.customer.update({
      where: { id: parseInt(customerId) },
      data: {
        name: name.trim(),
        skpd_name: skpd_name !== undefined ? (skpd_name ? skpd_name.trim() : null) : undefined,
        is_custom_name: true // Tandai bahwa nama telah dikustomisasi manual di Web Dashboard
      }
    });

    // Catat ke catatan internal bahwa identitas pelapor diperbarui
    // Cari tiket aktif dari customer ini jika ada
    const activeTicket = await prisma.ticket.findFirst({
      where: {
        customer_id: updatedCustomer.id,
        status: { in: ['OPEN', 'RESOLVED'] }
      },
      orderBy: { created_at: 'desc' }
    });

    if (activeTicket) {
      const editorName = req.user ? req.user.name : 'Petugas Helpdesk';
      const skpdInfo = updatedCustomer.skpd_name ? ` (Instansi: ${updatedCustomer.skpd_name})` : '';
      const noteMsg = await prisma.message.create({
        data: {
          ticket_id: activeTicket.id,
          sender_type: 'AGENT',
          sender_id: req.user ? req.user.id : null,
          message_text: `[SISTEM] Identitas pelapor diperbarui oleh ${editorName}: "${updatedCustomer.name}"${skpdInfo}`,
          is_internal: true
        }
      });

      if (req.io) {
        req.io.emit('new_message', {
          ticketId: activeTicket.id,
          senderType: 'AGENT',
          text: noteMsg.message_text,
          isInternal: true,
          createdAt: noteMsg.created_at
        });
      }
    }

    if (req.io) {
      req.io.emit('customer_updated', {
        customerId: updatedCustomer.id,
        name: updatedCustomer.name,
        skpd_name: updatedCustomer.skpd_name,
        is_custom_name: updatedCustomer.is_custom_name
      });
    }

    res.json({ success: true, customer: updatedCustomer });
  } catch (error) {
    console.error('[Chat API] Error updating customer:', error);
    res.status(500).json({ error: 'Gagal memperbarui identitas pelapor' });
  }
};

module.exports = { 
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
  updateCustomer 
};


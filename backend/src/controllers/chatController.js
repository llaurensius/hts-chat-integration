const prisma = require('../config/db');
const evolutionService = require('../services/evolutionService');
const htsClientService = require('../services/htsClientService');
const { EVOLUTION_API_URL, EVOLUTION_API_TOKEN, EVOLUTION_INSTANCE_NAME } = require('../config/env');
const { sanitizeAttachmentUrl } = require('../utils/safePath');

// Mengambil semua tiket aktif beserta pesan terakhirnya
const getTickets = async (req, res) => {
  try {
    // Filter tiket berdasarkan peran
    // L1 / Admin / SPV melihat semua tiket (termasuk CLOSED agar tab "✓ Selesai"
    // dan tombol Re-Open di App.jsx:2310 punya sumber data).
    // L2 HANYA melihat tiket yang berstatus aduan (is_aduan = true) dan di-assign ke kategorinya.
    // Pemisahan tab aktif vs selesai dilakukan di frontend (App.jsx:2146-2150).
    let whereClause = {};

    if (req.user && req.user.role === 'L2') {
      if (!req.user.category_id) {
        // L2 tanpa penugasan category_id tidak boleh melihat tiket apa pun (AUTH-01)
        return res.json([]);
      }
      whereClause.is_aduan = true; // Isolasi percakapan biasa dari antrean L2 (Fase 1 - V4)
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
        hts_tickets: {
          include: { category: true },
          orderBy: { created_at: 'asc' }
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
  const parsedTicketId = parseInt(ticketId);
  if (isNaN(parsedTicketId)) {
    return res.status(400).json({ error: 'ID tiket tidak valid' });
  }

  try {
    // Validasi hak akses untuk L2: hanya boleh melihat pesan pada tiket aduan yang ditugaskan ke timnya (AUTH-01)
    if (req.user && req.user.role === 'L2') {
      if (!req.user.category_id) {
        return res.status(403).json({ error: 'Akses ditolak: Akun teknisi belum terhubung ke kategori tim' });
      }
      const ticket = await prisma.ticket.findUnique({
        where: { id: parsedTicketId },
        select: {
          id: true,
          is_aduan: true,
          categories: { select: { category_id: true } }
        }
      });
      if (!ticket) {
        return res.status(404).json({ error: 'Tiket tidak ditemukan' });
      }
      if (!ticket.is_aduan || !ticket.categories.some(c => c.category_id === req.user.category_id)) {
        return res.status(403).json({ error: 'Akses ditolak: Anda tidak memiliki akses ke percakapan tiket ini' });
      }
    }

    const messages = await prisma.message.findMany({
      where: { ticket_id: parsedTicketId },
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
    const evoRes = await evolutionService.sendText(waNumber, text);
    const waMessageId = evoRes?.key?.id || null;

    // 3. Simpan riwayat balasan agen ke Database
    const savedMessage = await prisma.message.create({
      data: {
        ticket_id: ticket.id,
        sender_type: 'AGENT',
        sender_id: userId || null, // Sesuai dengan field di schema.prisma
        message_text: text,
        wa_message_id: waMessageId
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

// Helper parser ID PIC HTS yang robust untuk array, JSON, string koma, atau string tunggal
const parsePicIds = (input, fallbackSingle) => {
  let result = [];
  if (Array.isArray(input)) {
    result = input.map(String).map(s => s.trim()).filter(Boolean);
  } else if (typeof input === 'number') {
    result = [String(input)];
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          result = parsed.map(String).map(s => s.trim()).filter(Boolean);
        } else if (parsed) {
          result = [String(parsed).trim()];
        }
      } catch (e) {
        result = trimmed.split(',').map(s => s.trim()).filter(Boolean);
      }
    }
  }
  if (result.length === 0 && fallbackSingle) {
    const strSingle = String(fallbackSingle).trim();
    if (strSingle) result = [strSingle];
  }
  return result;
};

// Menutup Tiket dengan Mandatory Summary (F7), Multi-Tagging (F3), dan Dual-Close HTS (Fase 3 V3)
const closeTicket = async (req, res) => {
  const { ticketId } = req.params;
  const { summary, categoryIds, closeHtsTicket, htsPicId, htsPicIds, htsSolution, htsTglTeknis, htsJamTeknis, useChatImage } = req.body;

  // Hak akses ketat: Hanya L1, ADMIN, atau SPV yang berwenang menutup tiket (SEC-02)
  if (req.user && !['L1', 'ADMIN', 'SPV'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Akses ditolak: Hanya L1 atau Admin/SPV yang dapat menutup tiket' });
  }

  if (!summary || summary.trim().length < 10) {
    return res.status(400).json({ error: 'Kesimpulan wajib diisi minimal 10 karakter' });
  }

  try {
    const existingTicket = await prisma.ticket.findUnique({
      where: { id: parseInt(ticketId) },
      include: { hts_tickets: true }
    });

    if (!existingTicket) {
      return res.status(404).json({ error: 'Tiket tidak ditemukan' });
    }

    if (existingTicket.status === 'CLOSED') {
      return res.status(409).json({ error: 'Tiket sudah dalam status CLOSED' });
    }

    // FASE 3: Dual-Close ke Portal HTS Diskomdigi (/submit_teknis)
    let htsCloseSuccess = false;
    let htsCloseMessage = '';
    let finalMergedPicIds = [];

    // FIX 1 & 2: status HTS dibaca dari SSOT TicketHts (bukan kolom legacy yang rawan salah)
    const htsRows = existingTicket.hts_tickets || [];
    const pendingHtsList = htsRows.filter(h => h.hts_ticket_status !== 'SOLVED');
    const isAlreadySolvedInHts = htsRows.length > 0
      ? pendingHtsList.length === 0
      : existingTicket.hts_ticket_status === 'SOLVED';

    // Self-healing: kolom legacy pernah salah menyatakan SOLVED padahal TicketHts masih PENDING
    if (!isAlreadySolvedInHts && existingTicket.hts_ticket_status === 'SOLVED') {
      await prisma.ticket.update({
        where: { id: existingTicket.id },
        data: { hts_ticket_status: pendingHtsList[0]?.hts_ticket_status || 'PENDING' }
      });
    }

    if (existingTicket.hts_ticket_no && !isAlreadySolvedInHts && closeHtsTicket !== false && closeHtsTicket !== 'false') {
      try {
        // FIX 3: deklarasikan attachmentUrls (sebelumnya TIDAK ADA -> ReferenceError setiap submit)
        const attachmentUrls = [];
        if (req.files && req.files.length > 0) {
          req.files.forEach(f => attachmentUrls.push(`/uploads/${f.filename}`));
        } else if (req.file) {
          attachmentUrls.push(`/uploads/${req.file.filename}`);
        } else if (req.body.selectedAttachmentUrls) {
          const parsedUrls = typeof req.body.selectedAttachmentUrls === 'string'
            ? (req.body.selectedAttachmentUrls.startsWith('[') ? JSON.parse(req.body.selectedAttachmentUrls) : [req.body.selectedAttachmentUrls])
            : req.body.selectedAttachmentUrls;
          parsedUrls.forEach(u => {
            const clean = sanitizeAttachmentUrl(u);
            if (clean && !attachmentUrls.includes(clean)) attachmentUrls.push(clean);
          });
        } else if (req.body.selectedAttachmentUrl) {
          const clean = sanitizeAttachmentUrl(req.body.selectedAttachmentUrl);
          if (clean && !attachmentUrls.includes(clean)) attachmentUrls.push(clean);
        } else if (useChatImage === true || useChatImage === 'true') {
          const imageMsg = await prisma.message.findFirst({
            where: { ticket_id: existingTicket.id, attachment_url: { not: null } },
            orderBy: { created_at: 'desc' }
          });
          if (imageMsg) attachmentUrls.push(imageMsg.attachment_url);
        }
        const attachmentUrl = attachmentUrls[0] || null;

        // Hubungkan PIC Penerima/Awal dengan PIC Penanganan Akhir agar tersambung
        const initialPicIds = parsePicIds(existingTicket.hts_pic_ids);
        const closingPicIds = parsePicIds(htsPicIds, htsPicId);
        finalMergedPicIds = Array.from(new Set([...initialPicIds, ...closingPicIds]));
        if (finalMergedPicIds.length === 0) {
          finalMergedPicIds = ['14']; // Default PIC Helpdesk jika belum ditentukan
        }

        const targetsToSolve = pendingHtsList.length > 0
          ? pendingHtsList
          : [{ id: null, hts_ticket_id: existingTicket.hts_ticket_id, hts_ticket_no: existingTicket.hts_ticket_no }];

        const solvedNos = [];
        const failedItems = [];
        for (const target of targetsToSolve) {
          try {
            await htsClientService.solveTicketHts(
              req.user.id,
              target.hts_ticket_id || target.hts_ticket_no,
              {
                detil: htsSolution || summary.trim(),
                pic_id: finalMergedPicIds[0],
                pic_ids: finalMergedPicIds,
                tglteknis: htsTglTeknis || new Date().toISOString().split('T')[0],
                jam_problem: htsJamTeknis || new Date().toTimeString().split(' ')[0].substring(0, 5),
                attachmentUrl: attachmentUrl,
                attachmentUrls: attachmentUrls
              }
            );
            if (target.id) {
              await prisma.ticketHts.update({
                where: { id: target.id },
                data: { hts_ticket_status: 'SOLVED', solved_at: new Date() }
              });
            }
            solvedNos.push(target.hts_ticket_no);
          } catch (itemErr) {
            let reconciled = false;
            try {
              const realStatus = await htsClientService.lookupTicketByNumber(req.user.id, target.hts_ticket_no);
              if (realStatus && (realStatus.status === 'SOLVED' || realStatus.status === 'CLOSED')) {
                if (target.id) {
                  await prisma.ticketHts.update({
                    where: { id: target.id },
                    data: { hts_ticket_status: 'SOLVED', solved_at: new Date() }
                  });
                }
                solvedNos.push(target.hts_ticket_no);
                reconciled = true;
                console.log(`[Chat API] Rekonsiliasi berhasil: HTS #${target.hts_ticket_no} sudah SOLVED di portal.`);
              }
            } catch (_) {}

            if (!reconciled) {
              failedItems.push(`#${target.hts_ticket_no}: ${itemErr.message}`);
              console.error(`[Chat API] Gagal solve HTS #${target.hts_ticket_no}:`, itemErr.message);
            }
          }
        }

        // FIX 1: sukses hanya bila SELURUH target selesai. Gagal sebagianpun -> batalkan penutupan lokal.
        if (failedItems.length > 0) {
          return res.status(400).json({
            error: `Gagal menyelesaikan tiket di portal HTS - ${failedItems.join('; ')}. Tiket lokal TIDAK ditutup agar percakapan tidak terputus. Silakan hubungkan ulang akun portal HTS lalu coba kembali.`
          });
        }
        if (solvedNos.length === 0) {
          return res.status(400).json({
            error: 'Tidak ada tiket HTS berstatus PENDING yang dapat diselesaikan. Periksa status tiket di portal HTS.'
          });
        }

        htsCloseSuccess = true;
        htsCloseMessage = `[PORTAL HTS] Tiket HTS #${solvedNos.join(', #')} berhasil diselesaikan (SOLVED) di portal resmi HTS.`;
      } catch (htsErr) {
        console.error('[Chat API] Gagal submit teknis HTS saat closeTicket:', htsErr.message);
        // Pilihan 2: Jika penutupan tiket di portal HTS gagal, batalkan penutupan tiket lokal
        return res.status(400).json({
          error: `Gagal menyelesaikan tiket di portal HTS: ${htsErr.message}. Tiket tetap terbuka agar percakapan tidak tertutup dan dapat diperiksa kembali.`
        });
      }
    }

    // Update tiket lokal secara atomic dengan guard state machine
    const updateData = {
      status: 'CLOSED',
      summary: summary.trim(),
      closed_at: new Date()
    };
    if (htsCloseSuccess) {
      updateData.hts_ticket_status = 'SOLVED';
      if (finalMergedPicIds.length > 0) {
        updateData.hts_pic_ids = JSON.stringify(finalMergedPicIds);
      }
    }

    const parsedCatIds = parseCategoryIds(categoryIds);
    const targetTicketId = parseInt(ticketId);

    const txOperations = [
      prisma.ticket.updateMany({
        where: { id: targetTicketId, status: { not: 'CLOSED' } },
        data: updateData
      })
    ];

    if (parsedCatIds.length > 0) {
      txOperations.push(
        prisma.ticketCategory.deleteMany({
          where: {
            ticket_id: targetTicketId,
            category_id: { notIn: parsedCatIds }
          }
        }),
        prisma.ticketCategory.createMany({
          data: parsedCatIds.map(catId => ({
            ticket_id: targetTicketId,
            category_id: catId,
            is_resolved: true
          })),
          skipDuplicates: true
        }),
        prisma.ticketCategory.updateMany({
          where: { ticket_id: targetTicketId },
          data: { is_resolved: true, resolved_at: new Date() }
        })
      );
    }

    if (htsCloseMessage) {
      txOperations.push(
        prisma.message.create({
          data: {
            ticket_id: targetTicketId,
            sender_type: 'AGENT',
            sender_id: req.user ? req.user.id : 1,
            message_text: htsCloseMessage,
            is_internal: true
          }
        })
      );
    }

    const [updateResult] = await prisma.$transaction(txOperations);

    if (updateResult.count === 0) {
      return res.status(409).json({ error: 'Tiket sudah ditutup oleh proses lain' });
    }

    const updatedTicket = await prisma.ticket.findUnique({
      where: { id: targetTicketId },
      include: {
        customer: true,
        categories: { include: { category: true } },
        hts_tickets: { include: { category: true } }
      }
    });

    // Blast Notifikasi via Socket.io (F4) - Kasih tahu semua klien bahwa tiket diclose/diupdate
    if (req.io) {
      req.io.emit('ticket_closed', {
        ticketId: updatedTicket.id,
        summary: updatedTicket.summary,
        categorys: categoryIds
      });
      if (htsCloseMessage) {
        req.io.emit('new_message', {
          ticketId: updatedTicket.id,
          senderType: 'AGENT',
          text: htsCloseMessage,
          isInternal: true,
          createdAt: new Date().toISOString()
        });
      }
    }

    res.json({
      success: true,
      ticket: updatedTicket,
      htsSynced: htsCloseSuccess,
      message: htsCloseSuccess
        ? `Tiket lokal berhasil ditutup dan tiket resmi HTS #${existingTicket.hts_ticket_no} telah diselesaikan.`
        : 'Tiket berhasil diselesaikan dan ditutup.'
    });
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
    const evolutionApiUrl = EVOLUTION_API_URL;
    const evolutionApiKey = EVOLUTION_API_TOKEN;
    const instanceName = EVOLUTION_INSTANCE_NAME;

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

    let waMessageId = null;
    try {
      const evoMediaRes = await axios.post(`${evolutionApiUrl}/message/sendMedia/${instanceName}`, payload, {
        headers: {
          'apikey': evolutionApiKey,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });
      waMessageId = evoMediaRes.data?.key?.id || null;
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
        attachment_url: publicUrl,
        wa_message_id: waMessageId
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

// Helper parser ID Kategori yang robust untuk array, JSON, string angka, atau angka tunggal
const parseCategoryIds = (input, fallbackSingle) => {
  let result = [];
  if (Array.isArray(input)) {
    result = input.map(i => parseInt(i)).filter(i => !isNaN(i));
  } else if (typeof input === 'number') {
    result = [input];
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          result = parsed.map(i => parseInt(i)).filter(i => !isNaN(i));
        } else if (typeof parsed === 'number' || !isNaN(parseInt(parsed))) {
          result = [parseInt(parsed)];
        }
      } catch (e) {
        result = trimmed.split(',').map(s => parseInt(s.trim())).filter(i => !isNaN(i));
      }
    }
  }
  if (result.length === 0 && fallbackSingle) {
    const parsedSingle = parseInt(fallbackSingle);
    if (!isNaN(parsedSingle)) result = [parsedSingle];
  }
  return result;
};

// Assign Tiket ke Satu atau Banyak L2 (Multi-Assign) & Kirim Blast Notifikasi
const assignTicket = async (req, res) => {
  const { ticketId } = req.params;
  const { categoryIds, categoryId, serviceType } = req.body;

  // Hak akses ketat: Hanya L1, ADMIN, atau SPV yang berwenang menugaskan tiket (SEC-02)
  if (req.user && !['L1', 'ADMIN', 'SPV'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Akses ditolak: Hanya L1 atau Admin/SPV yang dapat menugaskan tiket' });
  }

  const targetIds = parseCategoryIds(categoryIds, categoryId);

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

    // Update service type jika diberikan & otomatis promosikan ke aduan teknis resmi (Fase 1 - V4)
    let serviceTypeStr = (serviceType && serviceType !== 'GENERAL_CHAT') 
      ? serviceType 
      : (ticket.service_type && ticket.service_type !== 'GENERAL_CHAT' ? ticket.service_type : 'TROUBLESHOOTING');
      
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        service_type: serviceTypeStr,
        is_aduan: true, // Otomatis dipromosikan jadi aduan teknis resmi saat ditugaskan ke L2
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

    // FASE 2: Otomasi Sinkronisasi Pembuatan Tiket di Portal HTS (Opsi Hybrid)
    let htsSyncSuccess = false;
    let htsNoTrouble = null;
    let htsSyncError = null;
    if (req.body.createHtsTicket === true || req.body.createHtsTicket === 'true') {
      try {
        const {
          hts_cust,
          hts_opd,
          induk_opd_id,
          hts_tgltshoot,
          hts_jam_problem,
          hts_kategori,
          hts_sub_kategori,
          hts_detil,
          hts_pic_id,
          hts_pic_ids,
          useChatImage
        } = req.body;
        
        const firstCustomerMsg = await prisma.message.findFirst({
          where: { ticket_id: ticket.id, sender_type: 'CUSTOMER' },
          orderBy: { created_at: 'asc' }
        });

        let attachmentUrl = null;
        if (req.file) {
          attachmentUrl = `/uploads/${req.file.filename}`;
        } else if (req.body.selectedAttachmentUrl) {
          attachmentUrl = req.body.selectedAttachmentUrl;
        } else if (useChatImage === true || useChatImage === 'true') {
          const imageMsg = await prisma.message.findFirst({
            where: { ticket_id: ticket.id, attachment_url: { not: null } },
            orderBy: { created_at: 'desc' }
          });
          if (imageMsg) attachmentUrl = imageMsg.attachment_url;
        }

        // Sinkronisasi update nama/instansi pelapor jika diedit oleh L1
        if (hts_cust && hts_cust.trim() && hts_cust.trim() !== ticket.customer.name) {
          await prisma.customer.update({
            where: { id: ticket.customer_id },
            data: { name: hts_cust.trim(), is_custom_name: true }
          });
          ticket.customer.name = hts_cust.trim();
        }
        if (hts_opd && hts_opd.trim() && hts_opd.trim() !== ticket.customer.skpd_name) {
          await prisma.customer.update({
            where: { id: ticket.customer_id },
            data: { skpd_name: hts_opd.trim() }
          });
          ticket.customer.skpd_name = hts_opd.trim();
        }

        const chosenPicIds = parsePicIds(hts_pic_ids, hts_pic_id);
        const htsResult = await htsClientService.createTicketPipeline(req.user.id, {
          cust: hts_cust || ticket.customer.name,
          wa: ticket.customer.wa_number,
          opd: hts_opd || ticket.customer.skpd_name || 'Dinas Komunikasi dan Informatika Provinsi Jawa Tengah',
          induk_opd_id: induk_opd_id || '',
          tgltshoot: hts_tgltshoot || new Date().toISOString().split('T')[0],
          jam_problem: hts_jam_problem || new Date().toTimeString().split(' ')[0].substring(0, 5),
          kategori: hts_kategori || 'troubleshoot',
          sub_kategori: hts_sub_kategori || (allActiveTeamNames.includes('Network') ? 'DISTRIBUTION NETWORK' : allActiveTeamNames.includes('Server') ? 'SERVER' : 'MECHANICAL & ELECTRICAL'),
          detil: hts_detil || firstCustomerMsg?.message_text || 'Keluhan dari Helpdesk WhatsApp',
          pic_id: chosenPicIds[0] || '14',
          pic_ids: chosenPicIds.length > 0 ? chosenPicIds : ['14'],
          attachmentUrl: attachmentUrl
        });

        await prisma.ticket.update({
          where: { id: ticket.id },
          data: {
            hts_ticket_id: htsResult.idTrouble,
            hts_ticket_no: htsResult.noTrouble,
            hts_ticket_status: htsResult.status,
            hts_synced_at: new Date(),
            hts_pic_ids: JSON.stringify(htsResult.picIds || (chosenPicIds.length > 0 ? chosenPicIds : ['14']))
          }
        });

        // Guard Anti-Duplikasi Universal (FIX-02) & Simpan ke hub Multi-HTS
        const duplicateCheckAssign = await prisma.ticketHts.findFirst({
          where: {
            ticket_id: ticket.id,
            OR: [
              { hts_ticket_no: { equals: htsResult.noTrouble, mode: 'insensitive' } },
              { hts_ticket_id: String(htsResult.idTrouble) }
            ]
          }
        });

        if (!duplicateCheckAssign) {
          await prisma.ticketHts.create({
            data: {
              ticket_id: ticket.id,
              category_id: newCategories?.[0]?.id || ticket.categories?.[0]?.category_id || null,
              hts_ticket_id: String(htsResult.idTrouble || ''),
              hts_ticket_no: htsResult.noTrouble,
              hts_ticket_status: htsResult.status || 'PENDING',
              hts_kategori: hts_kategori || 'troubleshoot',
              hts_sub_kategori: hts_sub_kategori || null,
              hts_detil: hts_detil || firstCustomerMsg?.message_text || null,
              hts_pic_ids: JSON.stringify(htsResult.picIds || (chosenPicIds.length > 0 ? chosenPicIds : ['14']))
            }
          });
        }

        htsSyncSuccess = true;
        htsNoTrouble = htsResult.noTrouble;
        noteText += `\n[PORTAL HTS] Tiket resmi berhasil diterbitkan: #${htsResult.noTrouble} (Status: Proses Penanganan)`;
      } catch (htsErr) {
        htsSyncError = htsErr.message;
        console.error('[Chat API] Gagal sinkronisasi tiket ke HTS saat assign:', htsErr.message);
        noteText += `\n[PORTAL HTS] Peringatan: Gagal sinkronisasi ke portal HTS (${htsErr.message}). Anda dapat menyinkronkannya nanti.`;
      }
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
    const evolutionApiUrl = EVOLUTION_API_URL;
    const evolutionApiKey = EVOLUTION_API_TOKEN;
    const instanceName = EVOLUTION_INSTANCE_NAME;
    const hostHeader = req.headers.host || 'localhost:5173';
    const dashboardUrl = hostHeader.includes(':') ? `http://${hostHeader.split(':')[0]}:5173` : `http://${hostHeader}:5173`;

    const axios = require('axios');
    const blastPromises = [];

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
        const sendPromise = axios.post(
          `${evolutionApiUrl}/message/sendText/${instanceName}`,
          { number: targetNumber, text: blastMessage },
          {
            headers: {
              'apikey': evolutionApiKey,
              'Content-Type': 'application/json'
            },
            timeout: 5000
          }
        ).then(() => {
          console.log(`[Blast] Sent L2 notification to ${cat.name} target: ${targetNumber}`);
        }).catch((evoError) => {
          console.error(`[Evolution API] Failed to send blast to ${cat.name} (${targetNumber}):`, evoError?.response?.data || evoError.message);
        });

        blastPromises.push(sendPromise);
      }
    }

    if (blastPromises.length > 0) {
      await Promise.allSettled(blastPromises);
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

    res.json({ 
      success: true, 
      message: `Tiket berhasil di-assign ke Tim: ${allActiveTeamNames}`,
      htsSyncSuccess,
      htsNoTrouble,
      htsError: htsSyncError
    });
  } catch (error) {
    console.error('[Chat API] Error assigning ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// L2 Menandai Tiket Selesai (Fase 6 & Fase 3 V3)
const resolveTicket = async (req, res) => {
  const { ticketId } = req.params;
  const { solution } = req.body;
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

    // Hak akses ketat: Hanya L2, ADMIN, atau SPV yang dapat menandai solusi teknis selesai (SEC-02)
    if (user && user.role === 'L1') {
      return res.status(403).json({ error: 'Akses ditolak: Petugas L1 tidak berwenang menandai solusi teknis selesai' });
    }

    let noteText = '';
    let isFullyResolved = false;

    // Ambil category_id user (fallback ke DB jika token belum memuat category_id)
    let effectiveCategoryId = user?.category_id;
    if (user && user.role === 'L2' && !effectiveCategoryId) {
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      if (dbUser && dbUser.category_id) {
        effectiveCategoryId = dbUser.category_id;
      }
    }

    // Jika yang resolve adalah L2 dengan kategori tertentu
    if (user && user.role === 'L2') {
      if (!effectiveCategoryId) {
        return res.status(403).json({ error: 'Akun teknisi Anda belum terhubung ke Tim Kategori manapun. Silakan hubungi Administrator.' });
      }

      const myCatRelation = ticket.categories.find(c => c.category_id === effectiveCategoryId);
      
      if (!myCatRelation) {
        return res.status(403).json({ error: 'Tim Anda tidak ditugaskan pada tiket ini' });
      }

      // Update status is_resolved dan simpan solution untuk kategori tim user ini
      await prisma.ticketCategory.update({
        where: {
          ticket_id_category_id: {
            ticket_id: ticket.id,
            category_id: effectiveCategoryId
          }
        },
        data: {
          is_resolved: true,
          solution: solution ? solution.trim() : null,
          resolved_at: new Date()
        }
      });

      const catName = myCatRelation.category.name;
      noteText = `[SISTEM] Tim ${catName} telah menandai kendala di bagiannya selesai.`;
      if (solution && solution.trim()) {
        noteText += `\n📋 *Catatan Solusi / Penanganan Teknis:* ${solution.trim()}`;
      }

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
        noteText += `\nSeluruh tim telah selesai menangani. Tiket berstatus RESOLVED (siap ditutup resmi oleh L1).`;
      }
    } else {
      // Jika Admin / SPV yang resolve langsung
      await prisma.ticketCategory.updateMany({
        where: { ticket_id: ticket.id },
        data: {
          is_resolved: true,
          solution: solution ? solution.trim() : null,
          resolved_at: new Date()
        }
      });
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { status: 'RESOLVED' }
      });
      isFullyResolved = true;
      noteText = `[SISTEM] Tiket ditandai selesai langsung oleh ${user?.name || 'Admin'}. Menunggu penutupan resmi oleh L1.`;
      if (solution && solution.trim()) {
        noteText += `\n📋 *Catatan Solusi:* ${solution.trim()}`;
      }
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
    res.status(500).json({ error: error.message || 'Internal server error' });
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

    // Hak akses ketat: Hanya L2, ADMIN, atau SPV yang dapat mengembalikan penugasan tim L2 (SEC-02)
    if (user && user.role === 'L1') {
      return res.status(403).json({ error: 'Akses ditolak: Petugas L1 tidak berwenang mengembalikan penugasan tim L2' });
    }

    if (user && user.role === 'L2' && !user.category_id) {
      return res.status(403).json({ error: 'Akun teknisi Anda belum terhubung ke kategori manapun' });
    }

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
  const parsedTicketId = parseInt(ticketId);
  if (isNaN(parsedTicketId)) {
    return res.status(400).json({ error: 'ID tiket tidak valid' });
  }
  
  if (!text || !text.trim()) return res.status(400).json({ error: 'Catatan tidak boleh kosong' });

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: parsedTicketId },
      include: { categories: true }
    });
    if (!ticket) return res.status(404).json({ error: 'Tiket tidak ditemukan' });

    if (req.user && req.user.role === 'L2') {
      if (!req.user.category_id || !ticket.is_aduan) {
        return res.status(403).json({ error: 'Akses ditolak: Anda tidak memiliki akses ke tiket ini' });
      }
      const isAssigned = ticket.categories.some(c => c.category_id === req.user.category_id);
      if (!isAssigned) {
        return res.status(403).json({ error: 'Akses ditolak: Tiket tidak ditugaskan ke tim Anda' });
      }
    }

    const savedMessage = await prisma.message.create({
      data: {
        ticket_id: parsedTicketId,
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

// Memperbarui Identitas Pelapor (Nama, Instansi/SKPD, & Nomor WhatsApp) - Khusus L1 dan ADMIN
const updateCustomer = async (req, res) => {
  const { customerId } = req.params;
  const { name, skpd_name, wa_number } = req.body;

  // Hak akses: L1, ADMIN, SPV
  if (req.user && !['L1', 'ADMIN', 'SPV'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Hanya L1 dan Admin yang memiliki izin mengubah identitas pelapor' });
  }

  try {
    const existing = await prisma.customer.findUnique({
      where: { id: parseInt(customerId) }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
    }

    if (name !== undefined && (!name || !name.trim())) {
      return res.status(400).json({ error: 'Nama pelapor tidak boleh kosong' });
    }

    let updateData = {
      name: name ? name.trim() : existing.name,
      skpd_name: skpd_name !== undefined ? (skpd_name ? skpd_name.trim() : null) : existing.skpd_name,
      is_custom_name: true // Tandai bahwa nama telah dikustomisasi manual di Web Dashboard
    };

    if (wa_number && wa_number.trim()) {
      let sanitizedNumber = wa_number.replace(/\D/g, '');
      if (sanitizedNumber.startsWith('0')) {
        sanitizedNumber = '62' + sanitizedNumber.substring(1);
      } else if (sanitizedNumber.startsWith('8')) {
        sanitizedNumber = '62' + sanitizedNumber;
      }

      if (sanitizedNumber !== existing.wa_number) {
        // Cek bentrok nomor pada customer lain
        const conflict = await prisma.customer.findUnique({
          where: { wa_number: sanitizedNumber }
        });
        if (conflict && conflict.id !== existing.id) {
          return res.status(400).json({ error: 'Nomor WhatsApp tersebut sudah terdaftar pada kontak lain' });
        }
        updateData.wa_number = sanitizedNumber;
      }
    }

    const updatedCustomer = await prisma.customer.update({
      where: { id: parseInt(customerId) },
      data: updateData
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
      const waInfo = updateData.wa_number ? ` [Nomor WA: ${updatedCustomer.wa_number}]` : '';
      const noteMsg = await prisma.message.create({
        data: {
          ticket_id: activeTicket.id,
          sender_type: 'AGENT',
          sender_id: req.user ? req.user.id : null,
          message_text: `[SISTEM] Identitas pelapor diperbarui oleh ${editorName}: "${updatedCustomer.name}"${skpdInfo}${waInfo}`,
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
        wa_number: updatedCustomer.wa_number,
        is_custom_name: updatedCustomer.is_custom_name
      });
    }

    res.json({ success: true, customer: updatedCustomer });
  } catch (error) {
    console.error('[Chat API] Error updating customer:', error);
    res.status(500).json({ error: error.message || 'Gagal memperbarui identitas pelapor' });
  }
};

// Sinkronisasi manual tiket yang sudah ada ke portal HTS (Opsi Susulan / Two-Step)
const syncTicketToHts = async (req, res) => {
  const { ticketId } = req.params;
  const {
    hts_cust,
    hts_opd,
    induk_opd_id,
    hts_tgltshoot,
    hts_jam_problem,
    hts_kategori,
    hts_sub_kategori,
    hts_detil,
    hts_pic_id,
    hts_pic_ids,
    useChatImage
  } = req.body;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: parseInt(ticketId) },
      include: {
        customer: true,
        categories: { include: { category: true } }
      }
    });

    if (!ticket) return res.status(404).json({ error: 'Tiket tidak ditemukan' });

    // Cek jika sudah pernah disinkronkan
    if (ticket.hts_ticket_id) {
      return res.status(400).json({ error: `Tiket ini sudah disinkronkan ke HTS dengan nomor #${ticket.hts_ticket_no}` });
    }

    // Sinkronisasi update nama/instansi/nomor pelapor jika diedit oleh L1
    if (hts_cust && hts_cust.trim() && hts_cust.trim() !== ticket.customer.name) {
      await prisma.customer.update({
        where: { id: ticket.customer_id },
        data: { name: hts_cust.trim(), is_custom_name: true }
      });
      ticket.customer.name = hts_cust.trim();
    }
    if (hts_opd && hts_opd.trim() && hts_opd.trim() !== ticket.customer.skpd_name) {
      await prisma.customer.update({
        where: { id: ticket.customer_id },
        data: { skpd_name: hts_opd.trim() }
      });
      ticket.customer.skpd_name = hts_opd.trim();
    }
    const hts_wa = req.body.hts_wa || req.body.wa;
    if (hts_wa && hts_wa.trim()) {
      let sanitizedNumber = hts_wa.replace(/\D/g, '');
      if (sanitizedNumber.startsWith('0')) sanitizedNumber = '62' + sanitizedNumber.substring(1);
      else if (sanitizedNumber.startsWith('8')) sanitizedNumber = '62' + sanitizedNumber;

      if (sanitizedNumber !== ticket.customer.wa_number) {
        const conflict = await prisma.customer.findUnique({ where: { wa_number: sanitizedNumber } });
        if (conflict && conflict.id !== ticket.customer_id) {
          return res.status(400).json({ error: 'Nomor WhatsApp tersebut sudah terdaftar pada kontak lain' });
        }
        await prisma.customer.update({
          where: { id: ticket.customer_id },
          data: { wa_number: sanitizedNumber }
        });
        ticket.customer.wa_number = sanitizedNumber;
      }
    }

    const firstCustomerMsg = await prisma.message.findFirst({
      where: { ticket_id: ticket.id, sender_type: 'CUSTOMER' },
      orderBy: { created_at: 'asc' }
    });

    let attachmentUrls = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach(f => attachmentUrls.push(`/uploads/${f.filename}`));
    } else if (req.file) {
      attachmentUrls.push(`/uploads/${req.file.filename}`);
    }
    
    // Tambahkan selectedAttachmentUrls jika dikirim (array atau string) dengan sanitasi anti path-traversal (SEC-04)
    if (req.body.selectedAttachmentUrls) {
      const parsedUrls = typeof req.body.selectedAttachmentUrls === 'string'
        ? (req.body.selectedAttachmentUrls.startsWith('[') ? JSON.parse(req.body.selectedAttachmentUrls) : [req.body.selectedAttachmentUrls])
        : req.body.selectedAttachmentUrls;
      parsedUrls.forEach(u => {
        const clean = sanitizeAttachmentUrl(u);
        if (clean && !attachmentUrls.includes(clean)) attachmentUrls.push(clean);
      });
    } else if (req.body.selectedAttachmentUrl) {
      const clean = sanitizeAttachmentUrl(req.body.selectedAttachmentUrl);
      if (clean && !attachmentUrls.includes(clean)) {
        attachmentUrls.push(clean);
      }
    } else if (useChatImage === true || useChatImage === 'true') {
      const imageMsg = await prisma.message.findFirst({
        where: { ticket_id: ticket.id, attachment_url: { not: null } },
        orderBy: { created_at: 'desc' }
      });
      if (imageMsg && !attachmentUrls.includes(imageMsg.attachment_url)) {
        attachmentUrls.push(imageMsg.attachment_url);
      }
    }
    const attachmentUrl = attachmentUrls[0] || null;

    const activeTeamNames = ticket.categories.map(c => c.category.name).join(', ');
    const finalDetil = (hts_detil || firstCustomerMsg?.message_text || '').trim();
    if (finalDetil.length < 10) {
      return res.status(400).json({ error: `Detil Permasalahan wajib diisi minimal 10 karakter untuk portal HTS (saat ini: ${finalDetil.length} karakter).` });
    }

    const chosenPicIds = parsePicIds(hts_pic_ids, hts_pic_id);
    const htsResult = await htsClientService.createTicketPipeline(req.user.id, {
      cust: hts_cust || ticket.customer.name,
      wa: ticket.customer.wa_number,
      opd: hts_opd || ticket.customer.skpd_name || 'Dinas Komunikasi dan Informatika Provinsi Jawa Tengah',
      induk_opd_id: induk_opd_id || '',
      tgltshoot: hts_tgltshoot || new Date().toISOString().split('T')[0],
      jam_problem: hts_jam_problem || new Date().toTimeString().split(' ')[0].substring(0, 5),
      kategori: hts_kategori || 'troubleshoot',
      sub_kategori: hts_sub_kategori || (activeTeamNames.includes('Network') ? 'DISTRIBUTION NETWORK' : activeTeamNames.includes('Server') ? 'SERVER' : 'MECHANICAL & ELECTRICAL'),
      detil: hts_detil || firstCustomerMsg?.message_text || 'Keluhan dari Helpdesk WhatsApp',
      pic_id: chosenPicIds[0] || '14',
      pic_ids: chosenPicIds.length > 0 ? chosenPicIds : ['14'],
      attachmentUrl: attachmentUrl,
      attachmentUrls: attachmentUrls
    });

    // Guard Anti-Duplikasi Universal (FIX-02)
    const duplicateCheckSync = await prisma.ticketHts.findFirst({
      where: {
        ticket_id: ticket.id,
        OR: [
          { hts_ticket_no: { equals: htsResult.noTrouble, mode: 'insensitive' } },
          { hts_ticket_id: String(htsResult.idTrouble || '') }
        ]
      }
    });

    if (duplicateCheckSync) {
      return res.status(400).json({
        error: `Nomor aduan HTS #${htsResult.noTrouble} sudah tertaut di percakapan ini.`
      });
    }

    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        hts_ticket_id: htsResult.idTrouble,
        hts_ticket_no: htsResult.noTrouble,
        hts_ticket_status: htsResult.status,
        hts_synced_at: new Date(),
        hts_pic_ids: JSON.stringify(htsResult.picIds || (chosenPicIds.length > 0 ? chosenPicIds : ['14']))
      },
      include: {
        customer: true,
        categories: { include: { category: true } }
      }
    });

    // Simpan juga ke hub Multi-HTS (TicketHts - V4)
    try {
      await prisma.ticketHts.create({
        data: {
          ticket_id: ticket.id,
          category_id: ticket.categories?.[0]?.category_id || null,
          hts_ticket_id: String(htsResult.idTrouble || ''),
          hts_ticket_no: htsResult.noTrouble,
          hts_ticket_status: htsResult.status || 'PENDING',
          hts_kategori: hts_kategori || 'troubleshoot',
          hts_sub_kategori: hts_sub_kategori || null,
          hts_detil: hts_detil || firstCustomerMsg?.message_text || null,
          hts_pic_ids: JSON.stringify(htsResult.picIds || (chosenPicIds.length > 0 ? chosenPicIds : ['14']))
        }
      });
    } catch (e) {
      console.warn('[Chat API] Note on creating TicketHts:', e.message);
    }

    const noteText = `[SISTEM] Tiket disinkronkan ke portal HTS oleh ${req.user?.name || 'Petugas'}: #${htsResult.noTrouble} (Status: Proses Penanganan)`;

    await prisma.message.create({
      data: {
        ticket_id: ticket.id,
        sender_type: 'AGENT',
        sender_id: req.user.id,
        message_text: noteText,
        is_internal: true
      }
    });

    const finalTicket = await prisma.ticket.findUnique({
      where: { id: ticket.id },
      include: {
        customer: true,
        categories: { include: { category: true } },
        hts_tickets: { include: { category: true } }
      }
    });

    if (req.io) {
      req.io.emit('ticket_updated', { ticketId: ticket.id });
      req.io.emit('hts_ticket_created', { ticketId: ticket.id });
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
      message: `Tiket berhasil disinkronkan ke HTS: #${htsResult.noTrouble}`,
      ticket: finalTicket
    });
  } catch (error) {
    console.error('[Chat API] Error syncing ticket to HTS:', error);
    res.status(500).json({ error: error.message || 'Gagal sinkronisasi tiket ke portal HTS' });
  }
};

// Sinkronisasi penyelesaian tiket yang berstatus pending di HTS ke status SOLVED
const syncSolveHts = async (req, res) => {
  const { ticketId } = req.params;
  const { solution, picId, picIds } = req.body;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: parseInt(ticketId) },
      include: {
        categories: { include: { category: true } }
      }
    });

    if (!ticket) return res.status(404).json({ error: 'Tiket tidak ditemukan' });
    if (!ticket.hts_ticket_no) return res.status(400).json({ error: 'Tiket ini belum terhubung ke nomor portal HTS' });

    const activeCatSolutions = ticket.categories
      ?.filter(tc => tc.solution)
      ?.map(tc => `${tc.category?.name ? `[${tc.category.name}] ` : ''}${tc.solution}`)
      .join('\n\n') || '';

    const finalSolution = solution || ticket.summary || activeCatSolutions || 'Permasalahan telah selesai ditangani secara teknis.';

    // Hubungkan PIC Penerima/Awal dengan PIC Penanganan Akhir agar tersambung
    const initialPicIds = parsePicIds(ticket.hts_pic_ids);
    const closingPicIds = parsePicIds(picIds, picId);
    let finalMergedPicIds = Array.from(new Set([...initialPicIds, ...closingPicIds]));
    if (finalMergedPicIds.length === 0) {
      finalMergedPicIds = ['14'];
    }

    const htsResult = await htsClientService.solveTicketHts(
      req.user.id,
      ticket.hts_ticket_id || ticket.hts_ticket_no,
      {
        detil: finalSolution,
        pic_id: finalMergedPicIds[0],
        pic_ids: finalMergedPicIds
      }
    );

    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        hts_ticket_status: 'SOLVED',
        hts_ticket_id: htsResult.idTrouble || ticket.hts_ticket_id,
        hts_pic_ids: JSON.stringify(finalMergedPicIds)
      },
      include: {
        customer: true,
        categories: { include: { category: true } }
      }
    });

    const noteMsg = await prisma.message.create({
      data: {
        ticket_id: ticket.id,
        sender_type: 'AGENT',
        sender_id: req.user.id,
        message_text: `[PORTAL HTS] Tiket #${ticket.hts_ticket_no} berhasil disinkronkan dan diselesaikan (SOLVED) di portal HTS oleh ${req.user?.name || 'Petugas'}.`,
        is_internal: true
      }
    });

    if (req.io) {
      req.io.emit('ticket_closed', { ticketId: ticket.id });
      req.io.emit('new_message', {
        ticketId: ticket.id,
        senderType: 'AGENT',
        text: noteMsg.message_text,
        isInternal: true,
        createdAt: noteMsg.created_at
      });
    }

    res.json({
      success: true,
      message: `Tiket #${ticket.hts_ticket_no} berhasil diselesaikan di portal HTS.`,
      ticket: updated
    });
  } catch (error) {
    console.error('[Chat API] Gagal sync solve HTS:', error);
    res.status(500).json({ error: error.message || 'Gagal menyelesaikan tiket di portal HTS' });
  }
};

// ==========================================
// FASE 1 V4: Multi-HTS Hub & Percakapan Biasa
// ==========================================

// 1. Mengambil seluruh tiket HTS yang terhubung ke satu tiket chat lokal
const getTicketHtsList = async (req, res) => {
  const { ticketId } = req.params;
  const parsedTicketId = parseInt(ticketId);
  if (isNaN(parsedTicketId)) {
    return res.status(400).json({ error: 'ID tiket tidak valid' });
  }

  try {
    if (req.user && req.user.role === 'L2') {
      const ticket = await prisma.ticket.findUnique({
        where: { id: parsedTicketId },
        select: { id: true, is_aduan: true, categories: { select: { category_id: true } } }
      });
      if (!ticket) return res.status(404).json({ error: 'Tiket tidak ditemukan' });
      if (!req.user.category_id || !ticket.is_aduan || !ticket.categories.some(c => c.category_id === req.user.category_id)) {
        return res.status(403).json({ error: 'Akses ditolak: Anda tidak memiliki akses ke daftar HTS tiket ini' });
      }
    }

    const htsList = await prisma.ticketHts.findMany({
      where: { ticket_id: parsedTicketId },
      include: { category: true },
      orderBy: { created_at: 'asc' }
    });
    res.json(htsList);
  } catch (error) {
    console.error('[Chat API V4] Error fetching TicketHts list:', error);
    res.status(500).json({ error: 'Gagal mengambil daftar tiket HTS' });
  }
};

// 2. Menerbitkan tiket HTS baru ke tiket aktif (Multi-HTS One-to-Many)
const createTicketHts = async (req, res) => {
  const { ticketId } = req.params;
  const {
    categoryId,
    hts_cust,
    hts_opd,
    induk_opd_id,
    hts_tgltshoot,
    hts_jam_problem,
    hts_kategori,
    hts_sub_kategori,
    hts_detil,
    hts_pic_id,
    hts_pic_ids,
    useChatImage
  } = req.body;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: parseInt(ticketId) },
      include: {
        customer: true,
        categories: { include: { category: true } }
      }
    });

    if (!ticket) return res.status(404).json({ error: 'Tiket tidak ditemukan' });

    // Sinkronisasi update nama/instansi/nomor pelapor jika diedit oleh L1
    if (hts_cust && hts_cust.trim() && hts_cust.trim() !== ticket.customer.name) {
      await prisma.customer.update({
        where: { id: ticket.customer_id },
        data: { name: hts_cust.trim(), is_custom_name: true }
      });
      ticket.customer.name = hts_cust.trim();
    }
    if (hts_opd && hts_opd.trim() && hts_opd.trim() !== ticket.customer.skpd_name) {
      await prisma.customer.update({
        where: { id: ticket.customer_id },
        data: { skpd_name: hts_opd.trim() }
      });
      ticket.customer.skpd_name = hts_opd.trim();
    }
    const hts_wa = req.body.hts_wa || req.body.wa;
    if (hts_wa && hts_wa.trim()) {
      let sanitizedNumber = hts_wa.replace(/\D/g, '');
      if (sanitizedNumber.startsWith('0')) sanitizedNumber = '62' + sanitizedNumber.substring(1);
      else if (sanitizedNumber.startsWith('8')) sanitizedNumber = '62' + sanitizedNumber;

      if (sanitizedNumber !== ticket.customer.wa_number) {
        const conflict = await prisma.customer.findUnique({ where: { wa_number: sanitizedNumber } });
        if (conflict && conflict.id !== ticket.customer_id) {
          return res.status(400).json({ error: 'Nomor WhatsApp tersebut sudah terdaftar pada kontak lain' });
        }
        await prisma.customer.update({
          where: { id: ticket.customer_id },
          data: { wa_number: sanitizedNumber }
        });
        ticket.customer.wa_number = sanitizedNumber;
      }
    }

    let attachmentUrls = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach(f => attachmentUrls.push(`/uploads/${f.filename}`));
    } else if (req.file) {
      attachmentUrls.push(`/uploads/${req.file.filename}`);
    }
    if (req.body.selectedAttachmentUrls) {
      const parsedUrls = typeof req.body.selectedAttachmentUrls === 'string'
        ? (req.body.selectedAttachmentUrls.startsWith('[') ? JSON.parse(req.body.selectedAttachmentUrls) : [req.body.selectedAttachmentUrls])
        : req.body.selectedAttachmentUrls;
      parsedUrls.forEach(u => {
        const clean = sanitizeAttachmentUrl(u);
        if (clean && !attachmentUrls.includes(clean)) attachmentUrls.push(clean);
      });
    } else if (req.body.selectedAttachmentUrl) {
      const clean = sanitizeAttachmentUrl(req.body.selectedAttachmentUrl);
      if (clean && !attachmentUrls.includes(clean)) {
        attachmentUrls.push(clean);
      }
    } else if (useChatImage === true || useChatImage === 'true') {
      const imageMsg = await prisma.message.findFirst({
        where: { ticket_id: ticket.id, attachment_url: { not: null } },
        orderBy: { created_at: 'desc' }
      });
      if (imageMsg && !attachmentUrls.includes(imageMsg.attachment_url)) {
        attachmentUrls.push(imageMsg.attachment_url);
      }
    }
    const attachmentUrl = attachmentUrls[0] || null;

    const firstCustomerMsg = await prisma.message.findFirst({
      where: { ticket_id: ticket.id, sender_type: 'CUSTOMER' },
      orderBy: { created_at: 'asc' }
    });

    const finalDetil = (hts_detil || firstCustomerMsg?.message_text || '').trim();
    if (finalDetil.length < 10) {
      return res.status(400).json({
        error: `Detil Permasalahan wajib diisi minimal 10 karakter untuk portal HTS (saat ini: ${finalDetil.length} karakter).`
      });
    }

    const chosenPicIds = parsePicIds(hts_pic_ids, hts_pic_id);
    const targetCategory = categoryId ? await prisma.category.findUnique({ where: { id: parseInt(categoryId) } }) : null;
    const subKategori = hts_sub_kategori || (targetCategory?.name?.includes('Server') ? 'SERVER' : targetCategory?.name?.includes('M&E') ? 'MECHANICAL & ELECTRICAL' : 'DISTRIBUTION NETWORK');

    // Pipeline submit 3-tahap HTS
    const htsResult = await htsClientService.createTicketPipeline(req.user.id, {
      cust: hts_cust || ticket.customer.name,
      wa: ticket.customer.wa_number,
      opd: hts_opd || ticket.customer.skpd_name || 'Dinas Komunikasi dan Informatika Provinsi Jawa Tengah',
      induk_opd_id: induk_opd_id || '',
      tgltshoot: hts_tgltshoot || new Date().toISOString().split('T')[0],
      jam_problem: hts_jam_problem || new Date().toTimeString().split(' ')[0].substring(0, 5),
      kategori: hts_kategori || 'troubleshoot',
      sub_kategori: subKategori,
      detil: finalDetil,
      pic_id: chosenPicIds[0] || '14',
      pic_ids: chosenPicIds.length > 0 ? chosenPicIds : ['14'],
      attachmentUrl: attachmentUrl,
      attachmentUrls: attachmentUrls
    });

    // Guard Anti-Duplikasi Universal (FIX-02)
    const duplicateCheck = await prisma.ticketHts.findFirst({
      where: {
        ticket_id: ticket.id,
        OR: [
          { hts_ticket_no: { equals: htsResult.noTrouble, mode: 'insensitive' } },
          { hts_ticket_id: String(htsResult.idTrouble) }
        ]
      }
    });

    if (duplicateCheck) {
      return res.status(400).json({
        error: `Nomor aduan HTS #${htsResult.noTrouble} sudah tertaut di percakapan ini.`
      });
    }

    // Simpan ke tabel TicketHts baru (V4)
    const newTicketHts = await prisma.ticketHts.create({
      data: {
        ticket_id: ticket.id,
        category_id: categoryId ? parseInt(categoryId) : null,
        hts_ticket_id: htsResult.idTrouble || '',
        hts_ticket_no: htsResult.noTrouble,
        hts_ticket_status: htsResult.status || 'PENDING',
        hts_kategori: hts_kategori || 'troubleshoot',
        hts_sub_kategori: subKategori,
        hts_detil: finalDetil,
        hts_pic_ids: JSON.stringify(chosenPicIds.length > 0 ? chosenPicIds : ['14'])
      },
      include: { category: true }
    });

    // Otomatis promosikan tiket induk menjadi aduan resmi jika sebelumnya berstatus percakapan biasa
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        is_aduan: true,
        service_type: ticket.service_type === 'GENERAL_CHAT' ? 'TROUBLESHOOTING' : (ticket.service_type || 'TROUBLESHOOTING'),
        hts_ticket_id: htsResult.idTrouble,
        hts_ticket_no: htsResult.noTrouble,
        hts_ticket_status: htsResult.status,
        hts_synced_at: new Date()
      }
    });

    const noteText = `[SISTEM] Tiket HTS #${htsResult.noTrouble} diterbitkan oleh ${req.user?.name || 'Petugas'}${targetCategory ? ` untuk Tim ${targetCategory.name}` : ''}.`;
    await prisma.message.create({
      data: {
        ticket_id: ticket.id,
        sender_type: 'AGENT',
        sender_id: req.user.id,
        message_text: noteText,
        is_internal: true
      }
    });

    if (req.io) {
      req.io.emit('ticket_updated', { ticketId: ticket.id });
      req.io.emit('hts_ticket_created', { ticketId: ticket.id, ticketHts: newTicketHts });
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
      message: `Tiket HTS #${htsResult.noTrouble} berhasil diterbitkan.`,
      ticketHts: newTicketHts
    });
  } catch (error) {
    console.error('[Chat API V4] Error creating TicketHts:', error);
    res.status(500).json({ error: error.message || 'Gagal menerbitkan tiket HTS baru' });
  }
};

// 3. Menyelesaikan tiket HTS spesifik secara mandiri (Per-Ticket Resolution V4)
const solveTicketHtsSingle = async (req, res) => {
  const { ticketId, htsId } = req.params;
  const { solution, picId, picIds } = req.body;

  try {
    const ticketHts = await prisma.ticketHts.findUnique({
      where: { id: parseInt(htsId) },
      include: { category: true, ticket: true }
    });

    if (!ticketHts || ticketHts.ticket_id !== parseInt(ticketId)) {
      return res.status(404).json({ error: 'Tiket HTS tidak ditemukan' });
    }

    const initialPicIds = parsePicIds(ticketHts.hts_pic_ids);
    const closingPicIds = parsePicIds(picIds, picId);
    let finalMergedPicIds = Array.from(new Set([...initialPicIds, ...closingPicIds]));
    if (finalMergedPicIds.length === 0) finalMergedPicIds = ['14'];

    const finalSolution = solution || ticketHts.solution || 'Permasalahan telah selesai ditangani secara teknis.';

    let htsResult;
    try {
      htsResult = await htsClientService.solveTicketHts(
        req.user.id,
        ticketHts.hts_ticket_id || ticketHts.hts_ticket_no,
        {
          detil: finalSolution,
          pic_id: finalMergedPicIds[0],
          pic_ids: finalMergedPicIds
        }
      );
    } catch (err) {
      let reconciled = false;
      try {
        const realStatus = await htsClientService.lookupTicketByNumber(req.user.id, ticketHts.hts_ticket_no);
        if (realStatus && (realStatus.status === 'SOLVED' || realStatus.status === 'CLOSED')) {
          reconciled = true;
          htsResult = { success: true, message: 'Tiket telah terkonfirmasi SOLVED di portal HTS (reconciled).' };
          console.log(`[Chat API] Rekonsiliasi berhasil: HTS #${ticketHts.hts_ticket_no} sudah SOLVED di portal.`);
        }
      } catch (_) {}

      if (!reconciled) {
        throw err;
      }
    }

    const updated = await prisma.ticketHts.update({
      where: { id: ticketHts.id },
      data: {
        hts_ticket_status: 'SOLVED',
        solution: finalSolution,
        hts_pic_ids: JSON.stringify(finalMergedPicIds),
        solved_at: new Date()
      },
      include: { category: true }
    });

    const noteMsg = await prisma.message.create({
      data: {
        ticket_id: parseInt(ticketId),
        sender_type: 'AGENT',
        sender_id: req.user.id,
        message_text: `[PORTAL HTS] Tiket HTS #${ticketHts.hts_ticket_no}${ticketHts.category ? ` (${ticketHts.category.name})` : ''} telah diselesaikan (SOLVED) oleh ${req.user?.name || 'Petugas'}.`,
        is_internal: true
      }
    });

    if (req.io) {
      req.io.emit('ticket_updated', { ticketId: parseInt(ticketId) });
      req.io.emit('hts_ticket_solved', { ticketId: parseInt(ticketId), ticketHts: updated });
      req.io.emit('new_message', {
        ticketId: parseInt(ticketId),
        senderType: 'AGENT',
        text: noteMsg.message_text,
        isInternal: true,
        createdAt: noteMsg.created_at
      });
    }

    res.json({
      success: true,
      message: `Tiket HTS #${ticketHts.hts_ticket_no} berhasil diselesaikan di portal HTS.`,
      ticketHts: updated
    });
  } catch (error) {
    console.error('[Chat API V4] Gagal solve TicketHts single:', error);
    res.status(500).json({ error: error.message || 'Gagal menyelesaikan tiket HTS' });
  }
};

// 4. Toggle manual status Percakapan Biasa <-> Aduan Teknis
const toggleAduan = async (req, res) => {
  const { ticketId } = req.params;
  const { is_aduan, service_type } = req.body;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: parseInt(ticketId) },
      include: { hts_tickets: true }
    });

    if (!ticket) return res.status(404).json({ error: 'Tiket tidak ditemukan' });

    // Proteksi: Jika ingin switch ke false tapi sudah ada tiket HTS aktif, cegah
    if (is_aduan === false && ticket.hts_tickets && ticket.hts_tickets.length > 0) {
      return res.status(400).json({
        error: 'Tidak dapat mengubah ke Percakapan Biasa karena tiket ini telah memiliki Tiket HTS resmi yang terhubung.'
      });
    }

    const nextIsAduan = is_aduan !== undefined ? is_aduan : !ticket.is_aduan;
    const nextServiceType = service_type || (nextIsAduan ? (ticket.service_type === 'GENERAL_CHAT' ? 'TROUBLESHOOTING' : ticket.service_type) : 'GENERAL_CHAT');

    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        is_aduan: nextIsAduan,
        service_type: nextServiceType
      },
      include: {
        customer: true,
        categories: { include: { category: true } },
        hts_tickets: { include: { category: true } }
      }
    });

    if (req.io) {
      req.io.emit('ticket_updated', { ticketId: ticket.id, ticket: updated });
    }

    res.json({
      success: true,
      message: `Status diubah menjadi: ${updated.is_aduan ? 'Aduan Teknis' : 'Percakapan Biasa'}`,
      ticket: updated
    });
  } catch (error) {
    console.error('[Chat API V4] Error toggling aduan:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 5. Penyelesaian cepat khusus percakapan biasa (One-Click Close V4)
const closeGeneralChat = async (req, res) => {
  const { ticketId } = req.params;
  const { summary } = req.body;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: parseInt(ticketId) },
      include: { customer: true }
    });

    if (!ticket) return res.status(404).json({ error: 'Tiket tidak ditemukan' });

    const finalSummary = (summary && summary.trim()) || 'Percakapan biasa selesai';

    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: 'CLOSED',
        is_aduan: false,
        service_type: 'GENERAL_CHAT',
        summary: finalSummary,
        closed_at: new Date()
      },
      include: {
        customer: true,
        categories: { include: { category: true } }
      }
    });

    // Validasi apakah sender_id user benar-benar ada di DB agar tidak melanggar foreign key constraint
    let validUserId = null;
    if (req.user?.id) {
      const userExists = await prisma.user.findUnique({ where: { id: parseInt(req.user.id) } });
      if (userExists) validUserId = userExists.id;
    }

    const closeMsg = await prisma.message.create({
      data: {
        ticket_id: ticket.id,
        sender_type: 'AGENT',
        sender_id: validUserId,
        message_text: `[SISTEM] Percakapan selesai ditutup oleh ${req.user?.name || 'Petugas'}.`,
        is_internal: true
      }
    });

    if (req.io) {
      req.io.emit('ticket_closed', { ticketId: ticket.id, ticket: updated });
      req.io.emit('new_message', {
        ticketId: ticket.id,
        senderType: 'AGENT',
        text: closeMsg.message_text,
        isInternal: true,
        createdAt: closeMsg.created_at
      });
    }

    res.json({
      success: true,
      message: 'Percakapan biasa berhasil diselesaikan.',
      ticket: updated
    });
  } catch (error) {
    console.error('[Chat API V4] Error closing general chat:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ==========================================
// FASE 2 V4: Catatan Internal Multimedia Dua Arah (L1 <-> L2)
// ==========================================

// Mengunggah gambar/media ke Catatan Internal (100% RAHASIA, tidak terkirim ke WhatsApp)
const sendInternalMedia = async (req, res) => {
  const { ticketId } = req.params;
  const { text, caption } = req.body;
  const file = req.file;
  const parsedTicketId = parseInt(ticketId);

  if (isNaN(parsedTicketId)) {
    return res.status(400).json({ error: 'ID tiket tidak valid' });
  }

  if (!file) {
    return res.status(400).json({ error: 'File gambar wajib diunggah' });
  }

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: parsedTicketId },
      include: { categories: true }
    });

    if (!ticket) return res.status(404).json({ error: 'Tiket tidak ditemukan' });

    if (req.user && req.user.role === 'L2') {
      if (!req.user.category_id || !ticket.is_aduan) {
        return res.status(403).json({ error: 'Akses ditolak: Anda tidak memiliki akses ke tiket ini' });
      }
      const isAssigned = ticket.categories.some(c => c.category_id === req.user.category_id);
      if (!isAssigned) {
        return res.status(403).json({ error: 'Akses ditolak: Tiket tidak ditugaskan ke tim Anda' });
      }
    }

    const finalCaption = (text || caption || '').trim();
    const attachmentUrl = `/uploads/${file.filename}`;

    const savedMessage = await prisma.message.create({
      data: {
        ticket_id: ticket.id,
        sender_type: 'AGENT',
        sender_id: req.user ? req.user.id : null,
        message_text: finalCaption || null,
        attachment_url: attachmentUrl,
        is_internal: true // 100% Internal, JAMINAN tidak dikirim ke Evolution API / WhatsApp
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

    // Siarkan via Socket.io khusus ke klien dashboard web
    if (req.io) {
      req.io.emit('new_message', {
        ticketId: ticket.id,
        senderName: savedMessage.sender?.name || req.user?.name || 'Petugas',
        text: savedMessage.message_text,
        attachmentUrl: savedMessage.attachment_url,
        isInternal: true,
        senderType: 'AGENT',
        sender: savedMessage.sender,
        createdAt: savedMessage.created_at
      });
    }

    res.json({
      success: true,
      message: savedMessage
    });
  } catch (error) {
    console.error('[Chat API V4] Error sending internal media:', error);
    res.status(500).json({ error: 'Gagal mengunggah media ke catatan internal' });
  }
};

// Mengambil daftar foto catatan internal yang ada di tiket ini (untuk opsi bukti penyelesaian HTS)
const getInternalMediaList = async (req, res) => {
  const { ticketId } = req.params;
  const parsedTicketId = parseInt(ticketId);
  if (isNaN(parsedTicketId)) {
    return res.status(400).json({ error: 'ID tiket tidak valid' });
  }

  try {
    if (req.user && req.user.role === 'L2') {
      const ticket = await prisma.ticket.findUnique({
        where: { id: parsedTicketId },
        select: { id: true, is_aduan: true, categories: { select: { category_id: true } } }
      });
      if (!ticket) return res.status(404).json({ error: 'Tiket tidak ditemukan' });
      if (!req.user.category_id || !ticket.is_aduan || !ticket.categories.some(c => c.category_id === req.user.category_id)) {
        return res.status(403).json({ error: 'Akses ditolak: Anda tidak memiliki akses ke media internal tiket ini' });
      }
    }

    const mediaMessages = await prisma.message.findMany({
      where: {
        ticket_id: parsedTicketId,
        is_internal: true,
        attachment_url: { not: null }
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            role: true,
            category: { select: { id: true, name: true } }
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    res.json(mediaMessages);
  } catch (error) {
    console.error('[Chat API V4] Error fetching internal media list:', error);
    res.status(500).json({ error: 'Gagal mengambil daftar media internal' });
  }
};

// ==========================================
// ENDPOINT FASE 3 V4: RIWAYAT CHAT LAMPAU & LAZY-LOAD WA
// ==========================================

// 1. Mengambil riwayat tiket tertutup (closed tickets) milik customer beserta seluruh pesannya
const getCustomerHistoryMessages = async (req, res) => {
  const { customerId } = req.params;
  const { excludeTicketId } = req.query;

  try {
    const whereClause = {
      customer_id: parseInt(customerId),
      status: 'CLOSED'
    };

    if (excludeTicketId) {
      whereClause.id = { not: parseInt(excludeTicketId) };
    }

    const closedTickets = await prisma.ticket.findMany({
      where: whereClause,
      include: {
        categories: { include: { category: true } },
        hts_tickets: { include: { category: true } },
        messages: {
          include: {
            sender: { select: { id: true, name: true, role: true, category: true } }
          },
          orderBy: { created_at: 'asc' }
        }
      },
      orderBy: { created_at: 'asc' }
    });

    res.json(closedTickets);
  } catch (error) {
    console.error('[History API V4] Error fetching closed tickets history:', error);
    res.status(500).json({ error: 'Gagal mengambil riwayat tiket lampau' });
  }
};

// 2. Mengambil riwayat pesan lama langsung dari WhatsApp via Evolution API (On-demand Lazy Load)
const fetchWaHistory = async (req, res) => {
  const { customerId } = req.params;
  const { limit = 20 } = req.body;

  try {
    const customer = await prisma.customer.findUnique({
      where: { id: parseInt(customerId) }
    });

    if (!customer || !customer.wa_number) {
      return res.status(404).json({ error: 'Pelanggan tidak ditemukan atau tidak memiliki nomor WhatsApp' });
    }

    const waMessages = await evolutionService.findMessages(customer.wa_number, limit);

    res.json({
      count: waMessages.length,
      messages: waMessages
    });
  } catch (error) {
    console.error('[History API V4] Error fetching WA history from Evolution API:', error);
    res.status(500).json({ error: 'Gagal mengambil riwayat pesan dari WhatsApp' });
  }
};

// ==========================================
// KUMPULAN ENDPOINT QUICK REPLIES (FASE 5 - V4)
// ==========================================

const DEFAULT_QUICK_REPLIES = [
  {
    id: 1,
    shortcut: 'salam',
    title: 'Salam Pembuka Layanan',
    content: 'Halo, selamat datang di Helpdesk Terpadu SPBE Diskomdigi Jawa Tengah. Ada yang bisa kami bantu?'
  },
  {
    id: 2,
    shortcut: 'aduan',
    title: 'Konfirmasi Penerusan ke Teknisi',
    content: 'Baik Bapak/Ibu, laporan kendala telah kami catat dan saat ini sedang kami koordinasikan dengan tim teknisi terkait.'
  },
  {
    id: 3,
    shortcut: 'progres',
    title: 'Pembaruan Progres Penanganan',
    content: 'Laporan Anda saat ini sedang dalam proses pengecekan dan perbaikan teknis oleh tim di lapangan. Kami akan segera memperbarui status penanganannya kepada Anda.'
  },
  {
    id: 4,
    shortcut: 'selesai',
    title: 'Pemberitahuan Kendala Selesai',
    content: 'Perbaikan teknis telah selesai dilaksanakan. Mohon berkenan untuk melakukan pengecekan kembali dari sisi Bapak/Ibu.'
  },
  {
    id: 5,
    shortcut: 'tutup',
    title: 'Salam Penutup Layanan',
    content: 'Terima kasih atas konfirmasinya. Tiket layanan ini kami selesaikan. Jika membutuhkan bantuan kembali, silakan hubungi kami. Selamat beraktivitas!'
  },
  {
    id: 6,
    shortcut: 'info',
    title: 'Permintaan Nama & OPD',
    content: 'Bisa mohon diinformasikan nama lengkap dan asal OPD/Instansi Bapak/Ibu untuk kelengkapan data tiket layanan kami?'
  }
];

// 1. Mengambil seluruh template balasan cepat
const getQuickReplies = async (req, res) => {
  try {
    let replies = [];
    if (prisma.quickReply) {
      replies = await prisma.quickReply.findMany({
        orderBy: { shortcut: 'asc' }
      });
    } else {
      replies = await prisma.$queryRawUnsafe(`
        SELECT id, shortcut, title, content, created_at, updated_at 
        FROM "QuickReply" 
        ORDER BY shortcut ASC;
      `);
    }

    if (!replies || replies.length === 0) {
      return res.json(DEFAULT_QUICK_REPLIES);
    }
    res.json(replies);
  } catch (error) {
    console.warn('[QuickReply API] Using fallback default templates:', error.message);
    res.json(DEFAULT_QUICK_REPLIES);
  }
};

// 2. Menambah template balasan cepat baru
const createQuickReply = async (req, res) => {
  try {
    const { shortcut, title, content } = req.body;
    if (!shortcut || !title || !content) {
      return res.status(400).json({ error: 'Shortcut, judul, dan isi template wajib diisi' });
    }

    const cleanShortcut = shortcut.replace(/^\/+/, '').toLowerCase().trim();

    let created;
    if (prisma.quickReply) {
      created = await prisma.quickReply.create({
        data: {
          shortcut: cleanShortcut,
          title: title.trim(),
          content: content.trim()
        }
      });
    } else {
      const rows = await prisma.$queryRawUnsafe(`
        INSERT INTO "QuickReply" ("shortcut", "title", "content", "updated_at")
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        RETURNING *;
      `, cleanShortcut, title.trim(), content.trim());
      created = rows[0];
    }

    res.status(201).json({ success: true, data: created });
  } catch (error) {
    console.error('[QuickReply API] Error creating template:', error);
    if (error.code === 'P2002' || error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
      return res.status(400).json({ error: 'Shortcut tersebut sudah digunakan oleh template lain' });
    }
    res.status(500).json({ error: 'Gagal menyimpan template balasan cepat' });
  }
};

// 3. Mengubah template balasan cepat
const updateQuickReply = async (req, res) => {
  try {
    const { id } = req.params;
    const { shortcut, title, content } = req.body;

    const numId = parseInt(id);
    const cleanShortcut = shortcut ? shortcut.replace(/^\/+/, '').toLowerCase().trim() : undefined;

    let updated;
    if (prisma.quickReply) {
      updated = await prisma.quickReply.update({
        where: { id: numId },
        data: {
          ...(cleanShortcut && { shortcut: cleanShortcut }),
          ...(title && { title: title.trim() }),
          ...(content && { content: content.trim() })
        }
      });
    } else {
      const rows = await prisma.$queryRawUnsafe(`
        UPDATE "QuickReply"
        SET 
          shortcut = COALESCE($1, shortcut),
          title = COALESCE($2, title),
          content = COALESCE($3, content),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING *;
      `, cleanShortcut || null, title ? title.trim() : null, content ? content.trim() : null, numId);
      updated = rows[0];
    }

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('[QuickReply API] Error updating template:', error);
    res.status(500).json({ error: 'Gagal memperbarui template balasan cepat' });
  }
};

// 4. Menghapus template balasan cepat
const deleteQuickReply = async (req, res) => {
  try {
    const { id } = req.params;
    const numId = parseInt(id);

    if (prisma.quickReply) {
      await prisma.quickReply.delete({ where: { id: numId } });
    } else {
      await prisma.$executeRawUnsafe(`DELETE FROM "QuickReply" WHERE id = $1;`, numId);
    }

    res.json({ success: true, message: 'Template balasan cepat berhasil dihapus' });
  } catch (error) {
    console.error('[QuickReply API] Error deleting template:', error);
    res.status(500).json({ error: 'Gagal menghapus template balasan cepat' });
  }
};

// Menghapus/Melepas penautan tiket HTS dari percakapan
const unlinkHtsTicket = async (req, res) => {
  const { ticketId, htsTicketId } = req.params;

  try {
    let ticketHts = null;
    const parsedId = parseInt(htsTicketId);
    if (!isNaN(parsedId) && parsedId > 0) {
      ticketHts = await prisma.ticketHts.findUnique({
        where: { id: parsedId }
      });
    }

    if (!ticketHts) {
      ticketHts = await prisma.ticketHts.findFirst({
        where: { ticket_id: parseInt(ticketId) }
      });
    }

    const currentTicket = await prisma.ticket.findUnique({
      where: { id: parseInt(ticketId) }
    });

    if (!currentTicket) {
      return res.status(404).json({ error: 'Tiket tidak ditemukan' });
    }

    if (!ticketHts && !currentTicket.hts_ticket_no && !currentTicket.hts_ticket_id) {
      return res.status(404).json({ error: 'Tiket HTS tidak ditemukan pada percakapan ini' });
    }

    const removedNo = ticketHts?.hts_ticket_no || currentTicket.hts_ticket_no || 'HTS';

    // 1. Hapus dari tabel TicketHts jika ada
    if (ticketHts) {
      await prisma.ticketHts.delete({
        where: { id: ticketHts.id }
      });
    }

    // 2. Cek apakah masih ada tiket HTS lain pada tiket ini
    const remainingHts = await prisma.ticketHts.findMany({
      where: { ticket_id: parseInt(ticketId) }
    });

    // 3. Update field legacy di tabel Ticket
    const updateData = {};
    if (remainingHts.length > 0) {
      updateData.hts_ticket_id = remainingHts[0].hts_ticket_id;
      updateData.hts_ticket_no = remainingHts[0].hts_ticket_no;
      updateData.hts_ticket_status = remainingHts[0].hts_ticket_status;
      updateData.hts_pic_ids = remainingHts[0].hts_pic_ids;
    } else {
      updateData.hts_ticket_id = null;
      updateData.hts_ticket_no = null;
      updateData.hts_ticket_status = null;
      updateData.hts_pic_ids = null;
      updateData.hts_synced_at = null;
    }

    const updatedTicket = await prisma.ticket.update({
      where: { id: parseInt(ticketId) },
      data: updateData,
      include: {
        customer: true,
        categories: { include: { category: true } },
        hts_tickets: { include: { category: true } }
      }
    });

    // 4. Catat pesan sistem internal
    const noteText = `[SISTEM] Tautan ke tiket HTS #${removedNo} telah dilepas oleh ${req.user?.name || 'Petugas'}.`;
    await prisma.message.create({
      data: {
        ticket_id: parseInt(ticketId),
        sender_type: 'AGENT',
        sender_id: req.user.id,
        message_text: noteText,
        is_internal: true
      }
    });

    // 5. Broadcast Socket.io
    if (req.io) {
      req.io.emit('hts_ticket_deleted', { ticketId: parseInt(ticketId), htsTicketId: parseInt(htsTicketId) });
      req.io.emit('new_message', {
        ticketId: parseInt(ticketId),
        senderType: 'AGENT',
        text: noteText,
        isInternal: true,
        createdAt: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: `Tautan nomor HTS #${removedNo} berhasil dilepas.`,
      ticket: updatedTicket
    });
  } catch (error) {
    console.error('[Chat API] Error unlinking HTS ticket:', error);
    res.status(500).json({ error: 'Gagal melepas tautan tiket HTS' });
  }
};

// ==========================================
// FITUR: PENCARIAN BUKU KONTAK HP & START NEW CHAT OUTBOUND
// ==========================================

// 3. Mengaktifkan kembali tiket yang telah selesai (Re-Open Ticket)
const reopenTicket = async (req, res) => {
  const { ticketId } = req.params;
  const { reason } = req.body;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: parseInt(ticketId) },
      include: {
        customer: true,
        categories: { include: { category: true } },
        hts_tickets: { include: { category: true } }
      }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Tiket tidak ditemukan' });
    }

    if (ticket.status !== 'CLOSED') {
      return res.status(400).json({ error: 'Hanya tiket dengan status CLOSED yang dapat diaktifkan kembali' });
    }

    // Catat pesan log sistem internal
    const reasonText = reason && reason.trim() ? ` (Alasan: ${reason.trim()})` : '';
    const noteText = `[SISTEM] Tiket diaktifkan kembali (Re-opened) oleh ${req.user?.name || 'Petugas'}${reasonText}.`;

    // Ubah status kembali menjadi OPEN, kosongkan closed_at, dan reset status resolusi tim L2 pada TicketCategory
    await prisma.$transaction([
      prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          status: 'OPEN',
          closed_at: null
        }
      }),
      prisma.ticketCategory.updateMany({
        where: { ticket_id: ticket.id },
        data: {
          is_resolved: false,
          resolved_at: null,
          solution: null
        }
      }),
      prisma.message.create({
        data: {
          ticket_id: ticket.id,
          sender_type: 'AGENT',
          sender_id: req.user?.id || null,
          message_text: noteText,
          is_internal: true
        }
      })
    ]);

    const updated = await prisma.ticket.findUnique({
      where: { id: ticket.id },
      include: {
        customer: true,
        categories: { include: { category: true } },
        hts_tickets: { include: { category: true } }
      }
    });

    // Broadcast Socket.io
    if (req.io) {
      req.io.emit('ticket_updated', { ticketId: ticket.id, ticket: updated });
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
      message: 'Tiket berhasil diaktifkan kembali. Anda dapat melanjutkan percakapan.',
      ticket: updated
    });
  } catch (error) {
    console.error('[Chat API] Error reopening ticket:', error);
    res.status(500).json({ error: error.message || 'Gagal mengaktifkan kembali tiket' });
  }
};

// 1. Mencari kontak dari Buku Master Data DB (Prioritas 1) dan Buku Kontak HP Evolution (Prioritas 2)
const searchPhoneContacts = async (req, res) => {
  const { q = '', limit = 30, offset = 0 } = req.query;
  const maxLimit = Math.min(parseInt(limit) || 30, 100);
  const skip = Math.max(parseInt(offset) || 0, 0);
  const cleanQ = (q || '').trim();

  try {
    // 1. Query Kontak dari database lokal (Customer hasil import atau kustomisasi)
    const dbWhere = cleanQ ? {
      OR: [
        { name: { contains: cleanQ, mode: 'insensitive' } },
        { wa_number: { contains: cleanQ } },
        { skpd_name: { contains: cleanQ, mode: 'insensitive' } }
      ]
    } : {};

    const [totalDb, dbCustomers] = await Promise.all([
      prisma.customer.count({ where: dbWhere }),
      prisma.customer.findMany({
        where: dbWhere,
        orderBy: [
          { is_imported_contact: 'desc' },
          { is_custom_name: 'desc' },
          { name: 'asc' },
          { wa_number: 'asc' } // tiebreaker: urutan wajib stabil antar-halaman
        ],
        take: maxLimit,
        skip
      })
    ]);

    const seenNumbers = new Set();
    const results = [];

    // Masukkan kontak database lokal terlebih dahulu (Prioritas Utama)
    for (const c of dbCustomers) {
      seenNumbers.add(c.wa_number);
      results.push({
        remoteJid: `${c.wa_number}@s.whatsapp.net`,
        waNumber: c.wa_number,
        name: c.name,
        skpdName: c.skpd_name || null,
        isImported: c.is_imported_contact,
        isCustom: c.is_custom_name,
        waPushName: c.wa_push_name || null,
        source: c.is_imported_contact ? 'Master Data Import' : 'Database Helpdesk',
        profilePicUrl: null
      });
    }

    // 2. Query tambahan dari buku kontak HP Evolution API (hanya halaman pertama, cegah duplikat lintas halaman)
    if (skip === 0 && results.length < maxLimit) {
      const evoContacts = await evolutionService.searchContacts(cleanQ, maxLimit - results.length);
      for (const ec of evoContacts) {
        if (!seenNumbers.has(ec.waNumber)) {
          seenNumbers.add(ec.waNumber);
          results.push({
            remoteJid: ec.remoteJid,
            waNumber: ec.waNumber,
            name: ec.name,
            skpdName: null,
            isImported: false,
            isCustom: false,
            waPushName: null,
            source: 'Kontak HP WhatsApp',
            profilePicUrl: ec.profilePicUrl
          });
        }
      }
    }

    res.json({
      contacts: results,
      total: totalDb,
      offset: skip,
      limit: maxLimit,
      hasMore: skip + dbCustomers.length < totalDb
    });
  } catch (error) {
    console.error('[Chat API] Error searching combined contacts:', error);
    res.status(500).json({ error: 'Gagal mencari kontak' });
  }
};

// 2. Memulai chat baru ke kontak/nomor WhatsApp yang ditentukan
const startNewChat = async (req, res) => {
  const { waNumber, name, skpdName, initialMessage, sendInitialMessage = true, isAduan, serviceType } = req.body;

  if (!waNumber || !String(waNumber).trim()) {
    return res.status(400).json({ error: 'Nomor WhatsApp tujuan wajib diisi' });
  }

  const shouldSend = Boolean(sendInitialMessage && initialMessage && String(initialMessage).trim());

  // Format nomor WhatsApp (hapus karakter non-digit, ganti leading 0 dengan 62)
  let cleanNumber = String(waNumber).replace(/\D/g, '');
  if (cleanNumber.startsWith('0')) {
    cleanNumber = '62' + cleanNumber.substring(1);
  } else if (!cleanNumber.startsWith('62') && cleanNumber.length <= 11) {
    cleanNumber = '62' + cleanNumber;
  }

  try {
    // 1. Cari atau buat Customer di database
    let customer = await prisma.customer.findUnique({
      where: { wa_number: cleanNumber }
    });

    const resolvedName = (name && name.trim()) || customer?.name || cleanNumber;

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          wa_number: cleanNumber,
          name: resolvedName,
          skpd_name: skpdName && skpdName.trim() ? skpdName.trim() : null,
          is_custom_name: Boolean(name && name.trim())
        }
      });
    } else {
      // Jika nama diedit saat memulai chat baru
      if (name && name.trim() && name.trim() !== customer.name) {
        customer = await prisma.customer.update({
          where: { id: customer.id },
          data: {
            name: name.trim(),
            skpd_name: skpdName && skpdName.trim() ? skpdName.trim() : customer.skpd_name,
            is_custom_name: true
          }
        });
      }
    }

    // 2. Cek apakah ada tiket aktif (status OPEN atau RESOLVED)
    let activeTicket = await prisma.ticket.findFirst({
      where: {
        customer_id: customer.id,
        status: { in: ['OPEN', 'RESOLVED'] }
      },
      include: {
        customer: true,
        categories: { include: { category: true } },
        hts_tickets: { include: { category: true } }
      },
      orderBy: { created_at: 'desc' }
    });

    let isNewTicket = false;
    if (!activeTicket) {
      activeTicket = await prisma.ticket.create({
        data: {
          customer_id: customer.id,
          status: 'OPEN',
          is_aduan: Boolean(isAduan),
          service_type: serviceType || (isAduan ? 'TROUBLESHOOTING' : 'GENERAL_CHAT')
        },
        include: {
          customer: true,
          categories: { include: { category: true } },
          hts_tickets: { include: { category: true } }
        }
      });
      isNewTicket = true;
    }

    let savedMsg = null;
    if (shouldSend) {
      // 3. Kirim pesan ke WhatsApp tujuan via Evolution API jika diaktifkan
      const evoRes = await evolutionService.sendText(cleanNumber, initialMessage.trim());
      const waMessageId = evoRes?.key?.id || null;

      // 4. Simpan pesan keluar sebagai AGENT di database
      savedMsg = await prisma.message.create({
        data: {
          ticket_id: activeTicket.id,
          sender_type: 'AGENT',
          sender_id: req.user?.id || null,
          message_text: initialMessage.trim(),
          wa_message_id: waMessageId
        }
      });

      // 5. Broadcast Socket.io ke dashboard
      if (req.io) {
        req.io.emit('new_message', {
          ticketId: activeTicket.id,
          waNumber: cleanNumber,
          senderName: req.user?.name || 'Helpdesk',
          text: initialMessage.trim(),
          createdAt: savedMsg.created_at,
          senderType: 'AGENT'
        });
      }
    }

    res.json({
      success: true,
      message: shouldSend 
        ? 'Chat berhasil dimulai dan pesan pembuka terkirim ke WhatsApp.' 
        : 'Tiket percakapan berhasil dibuka (Pesan belum dikirim ke WhatsApp).',
      ticket: activeTicket,
      isNewTicket: isNewTicket
    });
  } catch (error) {
    console.error('[Chat API] Error starting new chat:', error);
    res.status(500).json({ error: error.message || 'Gagal memulai chat baru' });
  }
};

// ==========================================
// FASE 7 V4: Manual Link & Disaster Recovery Tiket HTS
// ==========================================

// Menautkan nomor tiket HTS yang sudah terlanjur terbit di portal resmi HTS
const linkHtsTicket = async (req, res) => {
  const { ticketId } = req.params;
  const { hts_ticket_no, category_id, force } = req.body;

  if (!hts_ticket_no || !String(hts_ticket_no).trim()) {
    return res.status(400).json({ error: 'Nomor aduan HTS wajib diisi' });
  }

  const cleanNo = String(hts_ticket_no).replace(/^#/, '').trim();

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: parseInt(ticketId) },
      include: {
        customer: true,
        categories: { include: { category: true } },
        hts_tickets: true
      }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Tiket Helpdesk tidak ditemukan' });
    }

    // 1. Validasi: Jangan izinkan menautkan nomor HTS yang sama berulang kali di percakapan yang sama
    const duplicateInSameTicket = await prisma.ticketHts.findFirst({
      where: {
        ticket_id: ticket.id,
        hts_ticket_no: { equals: cleanNo, mode: 'insensitive' }
      }
    });

    if (duplicateInSameTicket) {
      return res.status(400).json({
        error: `Nomor aduan HTS #${cleanNo} sudah tertaut pada percakapan ini!`
      });
    }

    // 2. Cek apakah nomor tiket HTS ini sudah pernah ditautkan ke tiket lain di sistem Helpdesk
    const existingTicketHts = await prisma.ticketHts.findFirst({
      where: {
        hts_ticket_no: { equals: cleanNo, mode: 'insensitive' }
      },
      include: {
        ticket: {
          include: { customer: true }
        }
      }
    });

    if (existingTicketHts && existingTicketHts.ticket_id !== ticket.id && !force) {
      return res.status(409).json({
        requires_confirmation: true,
        message: `Nomor HTS #${cleanNo} sudah pernah ditautkan ke Tiket #${existingTicketHts.ticket.id} (${existingTicketHts.ticket.customer?.name || 'Pelapor'}). Apakah Anda yakin ingin tetap menautkannya ke percakapan ini?`,
        existingTicket: {
          id: existingTicketHts.ticket.id,
          customerName: existingTicketHts.ticket.customer?.name || '-'
        }
      });
    }

    // 2. Hubungi portal HTS untuk memverifikasi dan menarik data tiket
    const htsData = await htsClientService.lookupTicketByNumber(req.user.id, cleanNo);

    // Guard Anti-Duplikasi Tambahan pasca-lookup (FIX-02)
    const duplicateAfterLookup = await prisma.ticketHts.findFirst({
      where: {
        ticket_id: ticket.id,
        OR: [
          { hts_ticket_no: { equals: htsData.noTrouble, mode: 'insensitive' } },
          { hts_ticket_id: String(htsData.idTrouble) }
        ]
      }
    });

    if (duplicateAfterLookup) {
      return res.status(400).json({
        error: `Nomor aduan HTS #${htsData.noTrouble} sudah tertaut pada percakapan ini!`
      });
    }

    // 3. Simpan ke tabel TicketHts (Hub Multi-HTS V4)
    const newTicketHts = await prisma.ticketHts.create({
      data: {
        ticket_id: ticket.id,
        category_id: category_id ? parseInt(category_id) : (ticket.categories?.[0]?.category_id || null),
        hts_ticket_id: String(htsData.idTrouble),
        hts_ticket_no: htsData.noTrouble,
        hts_ticket_status: htsData.status || 'PENDING',
        hts_kategori: htsData.kategori || 'troubleshoot',
        hts_sub_kategori: htsData.subKategori || null,
        hts_detil: htsData.detil || null,
        hts_pic_ids: JSON.stringify(htsData.picIds || ['14'])
      },
      include: {
        category: true
      }
    });

    // 4. Otomatis Assign Tim Teknisi L2 jika category_id dipilih
    let assignedCategoryName = '';
    if (category_id) {
      const parsedCatId = parseInt(category_id);
      const isAlreadyAssigned = ticket.categories.some(tc => (tc.category_id || tc.category?.id) === parsedCatId);
      if (!isAlreadyAssigned) {
        await prisma.ticketCategory.create({
          data: {
            ticket_id: ticket.id,
            category_id: parsedCatId,
            is_resolved: htsData.status === 'SOLVED'
          }
        });
        const catInfo = await prisma.category.findUnique({ where: { id: parsedCatId } });
        if (catInfo) assignedCategoryName = catInfo.name;
      }
    }

    // 5. Perbarui tiket utama: Auto-Promotion ke is_aduan = true dan update field legacy jika kosong
    const updateTicketData = {
      is_aduan: true // Auto-promotion ke aduan teknis resmi
    };

    if (!ticket.hts_ticket_no) {
      updateTicketData.hts_ticket_id = String(htsData.idTrouble);
      updateTicketData.hts_ticket_no = htsData.noTrouble;
      updateTicketData.hts_ticket_status = htsData.status || 'PENDING';
      updateTicketData.hts_pic_ids = JSON.stringify(htsData.picIds || ['14']);
      updateTicketData.hts_synced_at = new Date();
    }

    const updatedTicket = await prisma.ticket.update({
      where: { id: ticket.id },
      data: updateTicketData,
      include: {
        customer: true,
        categories: { include: { category: true } },
        hts_tickets: { include: { category: true } }
      }
    });

    // 6. Catat log catatan internal sistem
    let noteText = `[SISTEM] Nomor tiket HTS #${htsData.noTrouble} berhasil ditautkan secara manual oleh ${req.user?.name || 'Petugas'} (Status: ${htsData.status || 'PENDING'}).`;
    if (assignedCategoryName) {
      noteText += ` Tim ${assignedCategoryName} otomatis ditugaskan.`;
    }

    await prisma.message.create({
      data: {
        ticket_id: ticket.id,
        sender_type: 'AGENT',
        sender_id: req.user.id,
        message_text: noteText,
        is_internal: true
      }
    });

    // 7. Siarkan notifikasi Socket.io ke dashboard
    if (req.io) {
      req.io.emit('hts_ticket_created', { ticketId: ticket.id, ticketHts: newTicketHts });
      if (assignedCategoryName) {
        req.io.emit('ticket_assigned', { ticketId: ticket.id });
      }
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
      message: `Nomor tiket HTS #${htsData.noTrouble} berhasil ditautkan.`,
      ticketHts: newTicketHts,
      ticket: updatedTicket
    });
  } catch (error) {
    console.error('[Chat API V4] Error linking HTS ticket:', error);
    res.status(500).json({ error: error.message || 'Gagal menautkan nomor tiket HTS' });
  }
};

// Melengkapi penugasan PIC untuk tiket HTS gantung (status INPUT_PIC)
const completeHtsPic = async (req, res) => {
  const { ticketId, htsTicketId } = req.params;
  const { pic_ids } = req.body;

  try {
    const ticketHts = await prisma.ticketHts.findUnique({
      where: { id: parseInt(htsTicketId) },
      include: { category: true }
    });

    if (!ticketHts || ticketHts.ticket_id !== parseInt(ticketId)) {
      return res.status(404).json({ error: 'Tiket HTS tidak ditemukan pada percakapan ini' });
    }

    const chosenPicIds = pic_ids && pic_ids.length > 0 ? pic_ids : parsePicIds(ticketHts.hts_pic_ids);
    const result = await htsClientService.completePicPipeline(req.user.id, ticketHts.hts_ticket_id, chosenPicIds);

    const updated = await prisma.ticketHts.update({
      where: { id: ticketHts.id },
      data: {
        hts_ticket_status: 'PENDING',
        hts_pic_ids: JSON.stringify(result.picIds)
      },
      include: { category: true }
    });

    const noteText = `[SISTEM] Penugasan PIC untuk tiket HTS #${ticketHts.hts_ticket_no} berhasil diselesaikan oleh ${req.user?.name || 'Petugas'} (Status: PENDING).`;
    await prisma.message.create({
      data: {
        ticket_id: parseInt(ticketId),
        sender_type: 'AGENT',
        sender_id: req.user.id,
        message_text: noteText,
        is_internal: true
      }
    });

    if (req.io) {
      req.io.emit('hts_ticket_updated', { ticketId: parseInt(ticketId), ticketHts: updated });
      req.io.emit('new_message', {
        ticketId: parseInt(ticketId),
        senderType: 'AGENT',
        text: noteText,
        isInternal: true,
        createdAt: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: `Tiket HTS #${ticketHts.hts_ticket_no} kini berstatus PENDING di portal HTS.`,
      ticketHts: updated
    });
  } catch (error) {
    console.error('[Chat API V4] Error completing HTS PIC:', error);
    res.status(500).json({ error: error.message || 'Gagal melengkapi penugasan PIC di portal HTS' });
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
  updateCustomer,
  syncTicketToHts,
  syncSolveHts,
  // Ekspor Endpoint Baru V4
  getTicketHtsList,
  createTicketHts,
  solveTicketHtsSingle,
  toggleAduan,
  closeGeneralChat,
  sendInternalMedia,
  getInternalMediaList,
  getCustomerHistoryMessages,
  fetchWaHistory,
  // Ekspor Endpoint V4 Fase 5 (Quick Replies)
  getQuickReplies,
  createQuickReply,
  updateQuickReply,
  deleteQuickReply,
  // Ekspor Endpoint V4 Fase 7 (Manual Link & Recovery HTS)
  linkHtsTicket,
  completeHtsPic,
  unlinkHtsTicket,
  // Ekspor Fitur Buku Kontak & Chat Baru
  searchPhoneContacts,
  startNewChat,
  reopenTicket
};



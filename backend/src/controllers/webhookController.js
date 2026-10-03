const prisma = require('../config/db');
const evolutionService = require('../services/evolutionService');
const fs = require('fs');
const path = require('path');
const { withLock } = require('../utils/perNumberLock');

const handleIncomingMessage = async (req, res) => {
  // Selalu balas 200 OK ke Evolution API dengan cepat agar webhook tidak timeout
  res.status(200).json({ status: 'success' });

  try {
    const payload = req.body;
    
    // Pastikan ini adalah event pesan masuk (messages.upsert)
    if (payload.event !== 'messages.upsert') return;
    
    const messageData = payload.data;

    if (!messageData || !messageData.message) return;

    // 1. Abaikan pesan dari grup WhatsApp
    const remoteJid = messageData.key.remoteJid;
    const remoteJidAlt = messageData.key.remoteJidAlt;
    const fromMe = Boolean(messageData.key.fromMe);
    const waMessageId = messageData.key.id || null;

    if (!remoteJid || remoteJid.includes('@g.us')) return;

    // Nomor WA target / lawan bicara (prioritas: remoteJidAlt jika remoteJid adalah LID)
    let targetJid = remoteJid;
    if (remoteJid.includes('@lid') && remoteJidAlt && remoteJidAlt.includes('@s.whatsapp.net')) {
      targetJid = remoteJidAlt;
    }
    const waNumber = targetJid.split('@')[0];
    if (!waNumber) return;

    // DATA-01: Serialisasi pemrosesan per nomor WA dengan lock untuk mencegah race-condition tiket aktif ganda
    await withLock(`wa:${waNumber}`, async () => {
      // 2. Cegah duplikasi jika waMessageId sudah ada di database (pesan terkirim via Web Dashboard)
      if (waMessageId) {
        const existingMsg = await prisma.message.findFirst({
          where: { wa_message_id: waMessageId }
        });
        if (existingMsg) {
          return;
        }
      }

    // Ekstrak teks pesan
    let conversation = 
      messageData.message.conversation || 
      messageData.message.extendedTextMessage?.text || 
      messageData.message.imageMessage?.caption;

    let attachmentUrl = null;

    // Cek apakah ada Media (Gambar) - Fase 3
    if (messageData.message.imageMessage) {
      if (!conversation) conversation = '[Mengirim Gambar]';
      
      const img = messageData.message.imageMessage;
      
      // 1. Cek apakah base64 sudah ada langsung di payload webhook
      let base64Data = 
        messageData.base64 || 
        img.base64 || 
        payload.base64 || 
        messageData.message?.base64;

      // 2. Jika tidak ada di payload, minta unduh ke Evolution API
      if (!base64Data) {
        try {
          const axios = require('axios');
          const { EVOLUTION_API_URL: EVO_URL, EVOLUTION_API_TOKEN: EVO_KEY, EVOLUTION_INSTANCE_NAME: INSTANCE } = require('../config/env');
          
          console.log('[Webhook] Fetching media base64 from Evolution API...');
          const mediaRes = await axios.post(
            `${EVO_URL}/chat/getBase64FromMediaMessage/${INSTANCE}`,
            { message: messageData },
            { 
              headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
              timeout: 15000
            }
          );
          
          base64Data = mediaRes.data?.base64 || mediaRes.data?.message?.base64;
          if (!base64Data) {
            console.log('[Webhook] Response from getBase64 (no base64):', JSON.stringify(mediaRes.data));
          }
        } catch (mediaErr) {
          console.error('[Webhook] Failed to download media from Evolution:', mediaErr?.response?.data || mediaErr.message);
        }
      }

      if (base64Data) {
        const buffer = Buffer.from(base64Data, 'base64');
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const filename = `img_${Date.now()}_${randomSuffix}.jpg`;
        const uploadDir = path.join(__dirname, '../../uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        fs.writeFileSync(path.join(uploadDir, filename), buffer);
        attachmentUrl = `/uploads/${filename}`;
        console.log(`[Webhook] Successfully saved image to ${attachmentUrl}`);
      } else {
        console.log('[Webhook] Warning: Image detected but could not extract base64.');
      }
    } else if (messageData.message.documentMessage) {
      if (!conversation) conversation = '[Mengirim Dokumen]';
    } else if (messageData.message.videoMessage) {
      if (!conversation) conversation = '[Mengirim Video]';
    }

    if (!conversation) conversation = '[Pesan Media/Sistem]';

    // Resolusi nama pelapor (Rekomendasi C - Hybrid: Web Custom > Kontak HP > WA pushName > waNumber)
    let resolvedName = (!fromMe && messageData.pushName) ? messageData.pushName : waNumber;
    try {
      const contactInfo = await evolutionService.getContactInfo(targetJid);
      if (contactInfo && contactInfo.isSaved && contactInfo.pushName) {
        resolvedName = contactInfo.pushName;
      }
    } catch (e) {
      console.warn('Gagal cek kontak HP dari Evolution API:', e.message);
    }

    // 1. Cek customer eksisting untuk menghormati Master Data Import & Edit Kustom
    const existingCustomer = await prisma.customer.findUnique({ where: { wa_number: waNumber } });
    const waPushName = (!fromMe && messageData.pushName) ? messageData.pushName : null;

    let customerUpdateData = {};
    if (waPushName) {
      customerUpdateData.wa_push_name = waPushName; // Selalu simpan nama profil WA asli sebagai pembanding
    }

    // Nama hanya di-update jika BUKAN hasil import resmi Admin dan BUKAN hasil edit manual dashboard
    if (!existingCustomer?.is_imported_contact && !existingCustomer?.is_custom_name) {
      if (!fromMe && resolvedName && resolvedName !== waNumber) {
        customerUpdateData.name = resolvedName;
      }
    }

    const customer = await prisma.customer.upsert({
      where: { wa_number: waNumber },
      update: customerUpdateData,
      create: {
        wa_number: waNumber,
        name: resolvedName,
        wa_push_name: waPushName,
        is_custom_name: false,
        is_imported_contact: false
      }
    });

    // 2. Cek apakah ada tiket aktif (status OPEN atau RESOLVED yang belum ditutup L1)
    let activeTicket = await prisma.ticket.findFirst({
      where: { 
        customer_id: customer.id, 
        status: { in: ['OPEN', 'RESOLVED'] } 
      },
      orderBy: { created_at: 'desc' }
    });

    let ticketId;

    if (!activeTicket) {
      // 3a. Jika belum ada tiket aktif, buat tiket baru secara aman dengan proteksi bentrok konkurensi
      try {
        const newTicket = await prisma.ticket.create({
          data: { 
            customer_id: customer.id, 
            status: 'OPEN',
            is_aduan: false,
            service_type: 'GENERAL_CHAT'
          }
        });
        ticketId = newTicket.id;

        // F1: Auto-Reply Bot (HANYA kirim jika pesan masuk DARI PELANGGAN, bukan dari helpdesk sendiri)
        if (!fromMe) {
          let botSetting = await prisma.setting.findUnique({ where: { key: 'auto_reply' } });
          const isBotActive = botSetting ? botSetting.is_active : true;
          const autoReplyText = botSetting?.value || "Baik untuk aduan akan kami cek dahulu mohon ditunggu.";

          if (isBotActive && autoReplyText.trim()) {
            try {
              await evolutionService.sendText(waNumber, autoReplyText);
              await prisma.message.create({
                data: {
                  ticket_id: ticketId,
                  sender_type: 'BOT',
                  message_text: autoReplyText
                }
              });
            } catch (botErr) {
              console.error('[Webhook] Failed to send auto-reply bot:', botErr.message);
            }
          }
        }
      } catch (raceErr) {
        // Jika request paralel lain baru saja membuat tiket di saat yang sama, ambil tiket tersebut
        const fallbackTicket = await prisma.ticket.findFirst({
          where: { customer_id: customer.id, status: { in: ['OPEN', 'RESOLVED'] } },
          orderBy: { created_at: 'desc' }
        });
        ticketId = fallbackTicket ? fallbackTicket.id : null;
      }
    } else {
      ticketId = activeTicket.id;
    }

    // 3b. Cek race-condition deduplikasi untuk pesan balasan helpdesk (dari HP fisik)
    if (fromMe) {
      const oneMinuteAgo = new Date(Date.now() - 60000);
      const recentDup = await prisma.message.findFirst({
        where: {
          ticket_id: ticketId,
          sender_type: 'AGENT',
          message_text: conversation,
          created_at: { gte: oneMinuteAgo }
        }
      });
      if (recentDup) {
        return;
      }
    }

    // 4. Simpan pesan ke database secara atomik (DATA-02: tangkap P2002 jika terjadi bentrok duplikat)
    const senderType = fromMe ? 'AGENT' : 'CUSTOMER';
    let savedMessage;
    try {
      savedMessage = await prisma.message.create({
        data: {
          ticket_id: ticketId,
          sender_type: senderType,
          message_text: conversation,
          attachment_url: attachmentUrl, // Fase 3: Simpan URL Attachment
          wa_message_id: waMessageId
        }
      });
    } catch (createErr) {
      if (createErr.code === 'P2002' && (createErr.meta?.target?.includes('wa_message_id') || createErr.message?.includes('wa_message_id'))) {
        console.log(`[Webhook] Duplikasi pesan wa_message_id ${waMessageId} dicegah secara atomik oleh constraint DB (P2002).`);
        return;
      }
      throw createErr;
    }

    // 5. Broadcast notifikasi ke Socket.io
    if (req.io) {
      req.io.emit('new_message', {
        ticketId,
        waNumber,
        senderName: fromMe ? 'Helpdesk (HP)' : customer.name,
        text: conversation,
        attachmentUrl: attachmentUrl, // Fase 3
        createdAt: savedMessage.created_at,
        senderType: senderType
      });
    }
    }); // Akhir dari withLock (`wa:${waNumber}`)

  } catch (error) {
    console.error('[Webhook] Error processing incoming message:', error);
  }
};

module.exports = { handleIncomingMessage };

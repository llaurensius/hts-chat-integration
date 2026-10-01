const prisma = require('../config/db');
const evolutionService = require('../services/evolutionService');
const fs = require('fs');
const path = require('path');

const handleIncomingMessage = async (req, res) => {
  // Selalu balas 200 OK ke Evolution API dengan cepat agar webhook tidak timeout
  res.status(200).json({ status: 'success' });

  try {
    const payload = req.body;
    
    // Pastikan ini adalah event pesan masuk (messages.upsert)
    if (payload.event !== 'messages.upsert') return;
    
    const messageData = payload.data;

    if (!messageData || !messageData.message) return;

    // Filter pesan dari diri sendiri atau dari grup
    const remoteJid = messageData.key.remoteJid;
    const fromMe = messageData.key.fromMe;
    if (fromMe || remoteJid.includes('@g.us')) return;

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
          const EVO_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
          const EVO_KEY = process.env.EVOLUTION_API_TOKEN || 'SecureTokenUntukBackend123';
          const INSTANCE = 'helpdesk-wa';
          
          console.log('[Webhook] Fetching media base64 from Evolution API...');
          const mediaRes = await axios.post(
            `${EVO_URL}/chat/getBase64FromMediaMessage/${INSTANCE}`,
            { message: messageData },
            { headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' } }
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
        const filename = `img_${Date.now()}.jpg`;
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

    // Nomor WA pengirim (hapus suffix @s.whatsapp.net)
    const waNumber = remoteJid.split('@')[0];

    // 1. Cari Customer (Pelapor) di database Helpdesk
    let customer = await prisma.customer.findUnique({ where: { wa_number: waNumber } });

    // Resolusi nama pelapor (Rekomendasi C - Hybrid: Web Custom > Kontak HP > WA pushName > waNumber)
    let resolvedName = messageData.pushName || waNumber;
    try {
      const contactInfo = await evolutionService.getContactInfo(remoteJid);
      if (contactInfo && contactInfo.isSaved && contactInfo.pushName) {
        resolvedName = contactInfo.pushName;
      }
    } catch (e) {
      console.warn('Gagal cek kontak HP dari Evolution API:', e.message);
    }

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          wa_number: waNumber,
          name: resolvedName,
          is_custom_name: false
        }
      });
    } else if (!customer.is_custom_name) {
      // Jika belum pernah di-edit manual dari Web Dashboard, update jika nama tersimpan di HP lebih spesifik
      if (customer.name === waNumber || (resolvedName && resolvedName !== waNumber && customer.name !== resolvedName)) {
        customer = await prisma.customer.update({
          where: { id: customer.id },
          data: { name: resolvedName }
        });
      }
    }

    // 2. Cek apakah ada tiket aktif (status OPEN atau RESOLVED yang belum ditutup L1)
    const activeTicket = await prisma.ticket.findFirst({
      where: { 
        customer_id: customer.id, 
        status: { in: ['OPEN', 'RESOLVED'] } 
      },
      orderBy: { created_at: 'desc' }
    });

    let ticketId;

    if (!activeTicket) {
      // 3a. Jika belum ada tiket aktif, buat tiket baru (default awal V4: Percakapan Biasa)
      const newTicket = await prisma.ticket.create({
        data: { 
          customer_id: customer.id, 
          status: 'OPEN',
          is_aduan: false,
          service_type: 'GENERAL_CHAT'
        }
      });
      ticketId = newTicket.id;

      // F1: Auto-Reply Bot (Kirim pesan balasan otomatis jika diaktifkan L1)
      let botSetting = await prisma.setting.findUnique({ where: { key: 'auto_reply' } });
      const isBotActive = botSetting ? botSetting.is_active : true;
      const autoReplyText = botSetting?.value || "Baik untuk aduan akan kami cek dahulu mohon ditunggu.";

      if (isBotActive && autoReplyText.trim()) {
        try {
          await evolutionService.sendText(waNumber, autoReplyText);
          // Simpan pesan sistem (Bot) ke database
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
    } else {
      ticketId = activeTicket.id;
    }

    // 4. Simpan pesan masuk pelanggan ke database
    const savedMessage = await prisma.message.create({
      data: {
        ticket_id: ticketId,
        sender_type: 'CUSTOMER',
        message_text: conversation,
        attachment_url: attachmentUrl // Fase 3: Simpan URL Attachment
      }
    });

    // 5. Broadcast notifikasi ke Socket.io
    if (req.io) {
      req.io.emit('new_message', {
        ticketId,
        waNumber,
        senderName: customer.name,
        text: conversation,
        attachmentUrl: attachmentUrl, // Fase 3
        createdAt: savedMessage.created_at
      });
    }

  } catch (error) {
    console.error('[Webhook] Error processing incoming message:', error);
  }
};

module.exports = { handleIncomingMessage };

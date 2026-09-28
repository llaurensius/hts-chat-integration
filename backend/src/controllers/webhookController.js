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
      // Jika disetting base64: true di webhook, evolution akan mengirim data base64
      if (img.base64) {
        const buffer = Buffer.from(img.base64, 'base64');
        const filename = `img_${Date.now()}.jpg`;
        const uploadDir = path.join(__dirname, '../../uploads');
        
        // Buat folder jika belum ada
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        fs.writeFileSync(path.join(uploadDir, filename), buffer);
        attachmentUrl = `/uploads/${filename}`;
        console.log(`[Webhook] Saved image to ${attachmentUrl}`);
      }
    } else if (messageData.message.documentMessage) {
      if (!conversation) conversation = '[Mengirim Dokumen]';
    } else if (messageData.message.videoMessage) {
      if (!conversation) conversation = '[Mengirim Video]';
    }

    if (!conversation) conversation = '[Pesan Media/Sistem]';

    // Nomor WA pengirim (hapus suffix @s.whatsapp.net)
    const waNumber = remoteJid.split('@')[0];
    const senderName = messageData.pushName || waNumber;

    // 1. Cari atau buat Customer (Pelapor)
    let customer = await prisma.customer.findUnique({ where: { wa_number: waNumber } });
    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          wa_number: waNumber,
          name: senderName
        }
      });
    }

    // 2. Cek apakah ada tiket aktif (status OPEN)
    const activeTicket = await prisma.ticket.findFirst({
      where: { customer_id: customer.id, status: 'OPEN' },
      orderBy: { created_at: 'desc' }
    });

    let ticketId;

    if (!activeTicket) {
      // 3a. Jika belum ada tiket aktif, buat tiket baru
      const newTicket = await prisma.ticket.create({
        data: { customer_id: customer.id, status: 'OPEN' }
      });
      ticketId = newTicket.id;

      // F1: Auto-Reply Bot (Kirim pesan balasan otomatis)
      const autoReply = "Baik untuk aduan akan kami cek dahulu mohon ditunggu.";
      await evolutionService.sendText(waNumber, autoReply);

      // Simpan pesan sistem (Bot) ke database
      await prisma.message.create({
        data: {
          ticket_id: ticketId,
          sender_type: 'BOT',
          message_text: autoReply
        }
      });
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
        senderName,
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

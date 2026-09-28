const prisma = require('../config/db');
const evolutionService = require('../services/evolutionService');

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
    const conversation = 
      messageData.message.conversation || 
      messageData.message.extendedTextMessage?.text || 
      messageData.message.imageMessage?.caption;

    if (!conversation) return; // Abaikan jika tidak ada teks/caption

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
      await evolutionService.sendText(remoteJid, autoReply);

      // Simpan pesan sistem (Bot) ke database
      await prisma.message.create({
        data: {
          ticket_id: ticketId,
          sender_type: 'BOT',
          message_text: autoReply
        }
      });
    } else {
      // 3b. Gunakan tiket yang sedang berjalan
      ticketId = activeTicket.id;
      // F6: Jeda Bot Rule logic akan diimplementasikan di sini jika dibutuhkan
    }

    // 4. Simpan pesan masuk pelanggan ke database
    const savedMessage = await prisma.message.create({
      data: {
        ticket_id: ticketId,
        sender_type: 'CUSTOMER',
        message_text: conversation
      }
    });

    // 5. Broadcast notifikasi ke Socket.io agar muncul di Dashboard secara realtime
    if (req.io) {
      req.io.emit('new_message', {
        ticketId,
        waNumber,
        senderName,
        text: conversation,
        createdAt: savedMessage.created_at
      });
    }

  } catch (error) {
    console.error('[Webhook] Error processing incoming message:', error);
  }
};

module.exports = { handleIncomingMessage };

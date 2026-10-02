const axios = require('axios');
require('dotenv').config();

const EVO_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVO_KEY = process.env.EVOLUTION_API_TOKEN || 'SecureTokenUntukBackend123';
const INSTANCE_NAME = 'helpdesk-wa';

const api = axios.create({
  baseURL: EVO_URL,
  headers: {
    'apikey': EVO_KEY,
    'Content-Type': 'application/json'
  }
});

// Mengirim pesan teks ke WhatsApp
const sendText = async (number, text) => {
  try {
    const res = await api.post(`/message/sendText/${INSTANCE_NAME}`, {
      number,
      text
    });
    return res.data;
  } catch (error) {
    console.error('[Evolution API] Error sending WA message:', error?.response?.data || error.message);
    throw error;
  }
};

// Mengambil informasi kontak dari buku kontak HP (Evolution API)
const getContactInfo = async (remoteJid) => {
  try {
    const res = await api.post(`/chat/findContacts/${INSTANCE_NAME}`, {
      where: { remoteJid }
    });
    if (Array.isArray(res.data) && res.data.length > 0) {
      return res.data[0];
    }
    return null;
  } catch (error) {
    console.warn('[Evolution API] Gagal mencari kontak:', error?.response?.data || error.message);
    return null;
  }
};

// Normalisasi records dari response Evolution API findMessages
const _normalizeRecords = (data) => {
  if (Array.isArray(data)) return data;
  if (data?.messages?.records && Array.isArray(data.messages.records)) return data.messages.records;
  if (data?.messages && Array.isArray(data.messages)) return data.messages;
  if (data?.records && Array.isArray(data.records)) return data.records;
  return [];
};

// Mengambil pesan-pesan lampau dari WhatsApp (Evolution API /chat/findMessages)
// Mendukung WhatsApp LID addressing mode (remoteJidAlt = nomor HP asli)
const findMessages = async (waNumber, limit = 20) => {
  try {
    const cleanNumber = String(waNumber).replace(/\D/g, '');
    const phoneJid = `${cleanNumber}@s.whatsapp.net`;
    const reqLimit = parseInt(limit) || 20;

    // Query 1: pakai remoteJid langsung (pesan lama pra-LID)
    // Query 2: pakai remoteJidAlt (pesan era LID addressing)
    const [resPhone, resLid] = await Promise.allSettled([
      api.post(`/chat/findMessages/${INSTANCE_NAME}`, {
        where: { key: { remoteJid: phoneJid } },
        limit: reqLimit
      }),
      api.post(`/chat/findMessages/${INSTANCE_NAME}`, {
        where: { key: { remoteJidAlt: phoneJid } },
        limit: reqLimit
      })
    ]);

    const rawPhone = resPhone.status === 'fulfilled' ? _normalizeRecords(resPhone.value.data) : [];
    const rawLid   = resLid.status   === 'fulfilled' ? _normalizeRecords(resLid.value.data)   : [];

    // Gabungkan dan dedupe berdasarkan WA message key.id
    const seenIds = new Set();
    const merged = [];
    for (const msg of [...rawPhone, ...rawLid]) {
      const msgId = msg.key?.id;
      if (msgId && seenIds.has(msgId)) continue;
      if (msgId) seenIds.add(msgId);
      merged.push(msg);
    }

    // Urutkan dari terlama ke terbaru, ambil N terbaru
    merged.sort((a, b) => (a.messageTimestamp || 0) - (b.messageTimestamp || 0));
    const sliced = merged.slice(-reqLimit);

    return sliced.map(msg => {
      const isFromMe = Boolean(msg.key?.fromMe);
      const text = msg.message?.conversation ||
                   msg.message?.extendedTextMessage?.text ||
                   msg.message?.imageMessage?.caption ||
                   msg.message?.documentMessage?.caption ||
                   (msg.message?.imageMessage ? '[Foto]' : '') ||
                   '';
      const timestamp = msg.messageTimestamp ? new Date(msg.messageTimestamp * 1000) : new Date();

      return {
        id: msg.key?.id || String(Math.random()),
        remoteJid: phoneJid,
        fromMe: isFromMe,
        sender_type: isFromMe ? 'AGENT' : 'CUSTOMER',
        message_text: text,
        created_at: timestamp,
        is_wa_archive: true
      };
    });
  } catch (error) {
    console.warn('[Evolution API] Gagal mengambil riwayat pesan WA:', error?.response?.data || error.message);
    return [];
  }
};

// Mencari daftar kontak dari buku telepon HP (Evolution API)
const searchContacts = async (query = '', limit = 15) => {
  try {
    const res = await api.post(`/chat/findContacts/${INSTANCE_NAME}`, {
      where: {}
    });

    let list = Array.isArray(res.data) ? res.data : [];
    
    // Filter hanya kontak orang (bukan grup atau broadcast)
    list = list.filter(c => c.remoteJid && !c.remoteJid.includes('@g.us') && !c.remoteJid.includes('@broadcast'));

    if (query && query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(c => {
        const name = (c.pushName || '').toLowerCase();
        const number = (c.remoteJid || '').split('@')[0];
        return name.includes(q) || number.includes(q);
      });
    }

    return list.slice(0, parseInt(limit) || 15).map(c => {
      const cleanNum = (c.remoteJid || '').split('@')[0];
      return {
        remoteJid: c.remoteJid,
        waNumber: cleanNum,
        name: c.pushName && c.pushName.trim() ? c.pushName.trim() : cleanNum,
        profilePicUrl: c.profilePicUrl || null
      };
    });
  } catch (error) {
    console.warn('[Evolution API] Gagal mencari kontak:', error?.response?.data || error.message);
    return [];
  }
};

module.exports = { sendText, getContactInfo, findMessages, searchContacts, INSTANCE_NAME, api };


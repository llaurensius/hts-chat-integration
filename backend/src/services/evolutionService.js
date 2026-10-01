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

// Mengambil pesan-pesan lampau dari WhatsApp (Evolution API /chat/findMessages)
const findMessages = async (waNumber, limit = 20) => {
  try {
    const cleanNumber = String(waNumber).replace(/\D/g, '');
    const remoteJid = cleanNumber.includes('@') ? cleanNumber : `${cleanNumber}@s.whatsapp.net`;
    const res = await api.post(`/chat/findMessages/${INSTANCE_NAME}`, {
      where: {
        key: {
          remoteJid
        }
      },
      limit: parseInt(limit) || 20
    });
    
    // Normalisasi struktur return Evolution API
    let rawMessages = [];
    if (Array.isArray(res.data)) {
      rawMessages = res.data;
    } else if (res.data?.messages && Array.isArray(res.data.messages)) {
      rawMessages = res.data.messages;
    } else if (res.data?.records && Array.isArray(res.data.records)) {
      rawMessages = res.data.records;
    }

    return rawMessages.map(msg => {
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
        remoteJid,
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

module.exports = { sendText, getContactInfo, findMessages, INSTANCE_NAME, api };


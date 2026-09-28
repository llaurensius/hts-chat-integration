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

module.exports = { sendText, getContactInfo, INSTANCE_NAME, api };


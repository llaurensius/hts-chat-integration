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

module.exports = { sendText, INSTANCE_NAME, api };

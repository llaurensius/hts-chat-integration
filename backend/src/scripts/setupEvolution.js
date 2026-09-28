const axios = require('axios');
require('dotenv').config();

const EVO_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVO_KEY = process.env.EVOLUTION_API_TOKEN || 'SecureTokenUntukBackend123';
const INSTANCE_NAME = 'helpdesk-wa';
const WEBHOOK_URL = 'http://host.docker.internal:3000/api/webhook/whatsapp'; // Asumsi backend jalan di host port 3000

const api = axios.create({
  baseURL: EVO_URL,
  headers: {
    'apikey': EVO_KEY,
    'Content-Type': 'application/json'
  }
});

async function setup() {
  try {
    console.log(`[Evolution] Mengecek atau membuat instance: ${INSTANCE_NAME}...`);
    
    // 1. Create Instance
    try {
      await api.post('/instance/create', {
        instanceName: INSTANCE_NAME,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
        reject_call: false
      });
      console.log('✅ Instance berhasil dibuat.');
    } catch (err) {
      if (err.response?.data?.message?.includes('already exists')) {
        console.log('ℹ️ Instance sudah ada. Lanjut ke setup Webhook.');
      } else {
        throw err;
      }
    }

    // 2. Setup Webhook
    console.log(`[Evolution] Mengatur Webhook ke: ${WEBHOOK_URL}`);
    await api.post(`/webhook/set/${INSTANCE_NAME}`, {
      url: WEBHOOK_URL,
      webhook_by_events: false,
      webhook_base64: false,
      events: [
        "MESSAGES_UPSERT",
        "MESSAGES_UPDATE"
      ]
    });
    console.log('✅ Webhook berhasil diatur.');

    // 3. Menampilkan status koneksi & QR Code
    const connection = await api.get(`/instance/connectionState/${INSTANCE_NAME}`);
    console.log('\n--- Status Koneksi ---');
    console.log('State:', connection.data.instance?.state);
    
    if (connection.data.instance?.state !== 'open') {
      console.log('\n[!] Instance belum terhubung ke WhatsApp.');
      console.log(`Buka endpoint berikut di browser untuk melihat QR Code (dan scan dengan WA HP Anda):`);
      console.log(`${EVO_URL}/instance/connect/${INSTANCE_NAME}`);
      console.log(`Jangan lupa gunakan API Key: ${EVO_KEY} sebagai bearer token atau di header apikey.`);
    }

  } catch (error) {
    console.error('❌ Terjadi kesalahan:', error?.response?.data || error.message);
  }
}

setup();

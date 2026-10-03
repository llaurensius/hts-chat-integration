const axios = require('axios');
const { 
  EVOLUTION_API_URL: EVO_URL, 
  EVOLUTION_API_TOKEN: EVO_KEY, 
  EVOLUTION_INSTANCE_NAME: INSTANCE_NAME 
} = require('../config/env');

const WEBHOOK_URL = 'http://172.17.0.1:3000/api/webhook/whatsapp'; // Menggunakan IP Host Docker Default

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
      const errMsg = err.response?.data?.response?.message?.[0] || err.response?.data?.message || '';
      if (errMsg.includes('already exists') || errMsg.includes('already in use')) {
        console.log('ℹ️ Instance sudah ada. Lanjut ke setup Webhook.');
      } else {
        throw err;
      }
    }

    // 2. Setup Webhook (Fase 3: Mengaktifkan base64 untuk Media Gambar)
    console.log(`[Evolution] Mengatur Webhook ke: ${WEBHOOK_URL}`);
    await api.post(`/webhook/set/${INSTANCE_NAME}`, {
      webhook: {
        enabled: true,
        url: WEBHOOK_URL,
        byEvents: false,
        base64: true, // <-- DIUBAH KE TRUE UNTUK MEDIA SUPPORT
        events: [
          "MESSAGES_UPSERT",
          "MESSAGES_UPDATE"
        ]
      }
    });
    console.log('✅ Webhook berhasil diatur.');

    // 3. Menampilkan status koneksi & QR Code
    const connection = await api.get(`/instance/connectionState/${INSTANCE_NAME}`);
    console.log('\n--- Status Koneksi ---');
    console.log('State:', connection.data.instance?.state);
    
    if (connection.data.instance?.state !== 'open') {
      console.log('\n[!] Instance belum terhubung ke WhatsApp.');
      
      // Ambil QR Code dari Evolution API
      try {
        const qrResponse = await api.get(`/instance/connect/${INSTANCE_NAME}`);
        if (qrResponse.data?.base64) {
          const fs = require('fs');
          const htmlContent = `
            <html>
            <body style="display:flex; justify-content:center; align-items:center; height:100vh; background-color:#f0f2f5;">
              <div style="text-align:center; background:white; padding:40px; border-radius:10px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                <h2>Scan QR Code WhatsApp Helpdesk</h2>
                <img src="${qrResponse.data.base64}" alt="QR Code" style="width:300px; height:300px; margin-top:20px;" />
                <p style="margin-top:20px; color:#666;">Buka aplikasi WhatsApp di HP Anda, masuk ke Perangkat Taut (Linked Devices), dan scan QR di atas.</p>
              </div>
            </body>
            </html>
          `;
          fs.writeFileSync('qr.html', htmlContent);
          console.log(`\n🎉 Buka file qr.html di browser Anda (File tersimpan di: backend/qr.html) untuk melakukan SCAN QR Code!`);
        }
      } catch (err) {
        console.log(`Gagal mengambil QR secara otomatis:`, err.message);
      }
    }

  } catch (error) {
    console.error('❌ Terjadi kesalahan:', error?.response?.data || error.message);
  }
}

setup();

require('dotenv').config();

const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'EVOLUTION_API_TOKEN'
];

const missing = requiredEnvVars.filter(key => !process.env[key] || !process.env[key].trim());

if (missing.length > 0) {
  console.error('\n=============================================================');
  console.error('[FATAL CONFIGURATION ERROR - SEC-03 FAIL-FAST]');
  console.error(`Variabel lingkungan wajib tidak ditemukan atau kosong: ${missing.join(', ')}`);
  console.error('Pastikan file .env telah dikonfigurasi dengan benar.');
  console.error('Server dihentikan untuk mencegah celah keamanan kredensial kosong.');
  console.error('=============================================================\n');
  process.exit(1);
}

// Peringatan jika secret menggunakan kunci bawaan/lemah
const INSECURE_SECRETS = ['supersecretkey_hts', 'supersecret'];
if (INSECURE_SECRETS.includes(process.env.JWT_SECRET)) {
  console.warn('\x1b[33m[PERINGATAN KEAMANAN] JWT_SECRET menggunakan nilai default. Segera ganti dengan string acak yang kuat!\x1b[0m');
}

module.exports = {
  PORT: process.env.PORT || 3000,
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  EVOLUTION_API_URL: process.env.EVOLUTION_API_URL || 'http://localhost:8080',
  EVOLUTION_API_TOKEN: process.env.EVOLUTION_API_TOKEN,
  EVOLUTION_INSTANCE_NAME: process.env.EVOLUTION_INSTANCE_NAME || 'helpdesk-wa',
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || process.env.EVOLUTION_API_TOKEN
};

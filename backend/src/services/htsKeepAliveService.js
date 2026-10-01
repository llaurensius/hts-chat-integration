const prisma = require('../config/db');
const htsClientService = require('./htsClientService');

let keepAliveInterval = null;

/**
 * Melakukan ping ringan otomatis ke portal HTS (/api/notif)
 * untuk setiap petugas L1/Admin yang sedang memiliki sesi login aktif.
 */
const pingActiveHtsSessions = async () => {
  try {
    const activeSessions = await prisma.htsUserSession.findMany({
      where: { is_logged_in: true },
      include: { user: true }
    });

    if (!activeSessions || activeSessions.length === 0) {
      return;
    }

    console.log(`[HTS Keep-Alive] Menjaga keaktifan ${activeSessions.length} sesi HTS petugas...`);

    for (const session of activeSessions) {
      try {
        const checkResult = await htsClientService.checkSession(session.user_id);
        if (checkResult.isLoggedIn) {
          console.log(`[HTS Keep-Alive] ✅ Sesi ${session.user.name} (${session.user.email}) tetap aktif.`);
        } else {
          console.log(`[HTS Keep-Alive] ⚠️ Sesi ${session.user.name} telah kedaluwarsa di portal HTS.`);
          await prisma.htsUserSession.update({
            where: { id: session.id },
            data: { is_logged_in: false }
          });
        }
      } catch (err) {
        console.warn(`[HTS Keep-Alive] Gagal ping sesi user ${session.user_id}:`, err.message);
      }
    }
  } catch (error) {
    console.error('[HTS Keep-Alive] Terjadi kesalahan pada loop heartbeat:', error.message);
  }
};

/**
 * Memulai background heartbeat timer
 * Default interval: setiap 15 menit
 */
const startHtsKeepAliveService = (intervalMinutes = 15) => {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }

  const intervalMs = intervalMinutes * 60 * 1000;
  console.log(`[HTS Keep-Alive] Background Heartbeat diinisialisasi (setiap ${intervalMinutes} menit).`);

  // Jalankan pemeriksaan awal setelah 30 detik server hidup
  setTimeout(() => {
    pingActiveHtsSessions();
  }, 30000);

  // Jadwalkan interval berkala
  keepAliveInterval = setInterval(() => {
    pingActiveHtsSessions();
  }, intervalMs);

  return keepAliveInterval;
};

module.exports = {
  startHtsKeepAliveService,
  pingActiveHtsSessions
};

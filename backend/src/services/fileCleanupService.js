const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const prisma = require('../config/db');
const { UPLOAD_DIR } = require('../utils/imageStorage');

let cleanupInterval = null;

/**
 * Membersihkan file media di folder uploads untuk tiket CLOSED yang telah melewati masa retensi (default 90 hari)
 * @param {number} retentionDays 
 */
const cleanupExpiredUploads = async (retentionDays = 90) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    console.log(`[File Cleanup] Memeriksa file lampau sebelum ${cutoffDate.toISOString().split('T')[0]} (retensi ${retentionDays} hari)...`);

    // 1. Ambil tiket-tiket CLOSED yang sudah ditutup sebelum cutoffDate
    const expiredClosedTickets = await prisma.ticket.findMany({
      where: {
        status: 'CLOSED',
        closed_at: { lt: cutoffDate }
      },
      select: {
        id: true,
        messages: {
          where: {
            attachment_url: { not: null }
          },
          select: {
            id: true,
            attachment_url: true
          }
        }
      }
    });

    let removedCount = 0;

    for (const ticket of expiredClosedTickets) {
      for (const msg of ticket.messages) {
        if (!msg.attachment_url) continue;

        // attachment_url biasanya berbentuk "/uploads/filename.ext"
        const filename = path.basename(msg.attachment_url);
        const filePath = path.join(UPLOAD_DIR, filename);

        try {
          try {
            await fsPromises.unlink(filePath);
            removedCount++;
          } catch (e) {
            if (e.code !== 'ENOENT') throw e;
          }
          await prisma.message.update({
            where: { id: msg.id },
            data: { attachment_url: null }
          });
        } catch (fileErr) {
          console.warn(`[File Cleanup] Gagal menghapus file ${filename}:`, fileErr.message);
        }
      }
    }

    if (removedCount > 0) {
      console.log(`[File Cleanup] Berhasil membersihkan ${removedCount} file media kedaluwarsa.`);
    } else {
      console.log('[File Cleanup] Tidak ada file media kedaluwarsa yang perlu dibersihkan.');
    }
  } catch (error) {
    console.error('[File Cleanup] Error saat menjalankan pembersihan file:', error.message);
  }
};

/**
 * Memulai scheduler periodic pembersihan file
 * @param {number} retentionDays - default 90 hari
 * @param {number} intervalHours - default setiap 24 jam
 */
const startFileCleanupService = (retentionDays = 90, intervalHours = 24) => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }

  const intervalMs = intervalHours * 60 * 60 * 1000;
  console.log(`[File Cleanup] Service diinisialisasi (Retensi: ${retentionDays} hari, Interval cek: setiap ${intervalHours} jam).`);

  // Jalankan pemeriksaan awal setelah 1 menit server hidup
  setTimeout(() => {
    cleanupExpiredUploads(retentionDays);
  }, 60000);

  // Jadwalkan periodic
  cleanupInterval = setInterval(() => {
    cleanupExpiredUploads(retentionDays);
  }, intervalMs);
};

module.exports = {
  startFileCleanupService,
  cleanupExpiredUploads
};

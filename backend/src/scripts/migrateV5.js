const prisma = require('../config/db');

async function migrateV5() {
  console.log('🚀 Memulai migrasi database Fase 5 (QuickReply & SLA)...');

  // 1. Buat tabel QuickReply jika belum ada
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "QuickReply" (
        "id" SERIAL PRIMARY KEY,
        "shortcut" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "idx_quickreply_shortcut" ON "QuickReply"("shortcut");`);
    console.log('✅ Tabel QuickReply & indeks shortcut berhasil dibuat.');
  } catch (err) {
    console.log('ℹ️ Catatan tabel QuickReply:', err.message);
  }

  // 2. Seed template default QuickReply
  const defaultTemplates = [
    {
      shortcut: 'salam',
      title: 'Salam Pembuka Layanan',
      content: 'Halo, selamat datang di Helpdesk Terpadu SPBE Diskomdigi Jawa Tengah. Ada yang bisa kami bantu?'
    },
    {
      shortcut: 'aduan',
      title: 'Konfirmasi Penerusan ke Teknisi',
      content: 'Baik Bapak/Ibu, laporan kendala telah kami catat dan saat ini sedang kami koordinasikan dengan tim teknisi terkait.'
    },
    {
      shortcut: 'progres',
      title: 'Pembaruan Progres Penanganan',
      content: 'Laporan Anda saat ini sedang dalam proses pengecekan dan perbaikan oleh tim teknisi. Kami akan segera menginfokan kembali setelah ada pembaruan.'
    },
    {
      shortcut: 'selesai',
      title: 'Pemberitahuan Kendala Selesai',
      content: 'Perbaikan teknis telah selesai dilaksanakan. Mohon berkenan untuk melakukan pengecekan kembali dari sisi Bapak/Ibu.'
    },
    {
      shortcut: 'tutup',
      title: 'Salam Penutup Layanan',
      content: 'Terima kasih atas konfirmasinya. Tiket layanan ini kami selesaikan. Jika membutuhkan bantuan kembali, silakan hubungi kami. Selamat beraktivitas!'
    },
    {
      shortcut: 'info',
      title: 'Permintaan Nama & OPD',
      content: 'Bisa mohon diinformasikan nama lengkap dan asal OPD/Instansi Bapak/Ibu untuk kelengkapan data tiket layanan kami?'
    }
  ];

  for (const t of defaultTemplates) {
    try {
      await prisma.$executeRawUnsafe(`
        INSERT INTO "QuickReply" ("shortcut", "title", "content", "updated_at")
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT ("shortcut") DO NOTHING;
      `, t.shortcut, t.title, t.content);
    } catch (e) {
      // ignore conflict
    }
  }
  console.log(`✅ Default template QuickReply berhasil disiapkan (${defaultTemplates.length} template).`);

  console.log('🎉 Migrasi Fase 5 selesai!');
}

migrateV5()
  .catch((e) => {
    console.error('❌ Gagal migrasi V5:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

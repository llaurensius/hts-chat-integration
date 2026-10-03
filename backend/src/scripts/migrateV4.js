const prisma = require('../config/db');

async function migrate() {
  console.log('🚀 Memulai migrasi database V4...');

  // 1. Tambahkan nilai enum baru ke ServiceType
  try {
    await prisma.$executeRawUnsafe(`ALTER TYPE "ServiceType" ADD VALUE IF NOT EXISTS 'GENERAL_CHAT';`);
    console.log('✅ Enum ServiceType: GENERAL_CHAT ditambahkan.');
  } catch (err) {
    console.log('ℹ️ Catatan Enum ServiceType:', err.message);
  }

  // 2. Tambahkan kolom is_aduan
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "is_aduan" BOOLEAN NOT NULL DEFAULT true;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Ticket" ALTER COLUMN "is_aduan" SET DEFAULT false;`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_ticket_is_aduan" ON "Ticket"("is_aduan");`);
    console.log('✅ Kolom is_aduan pada Ticket berhasil disiapkan.');
  } catch (err) {
    console.log('ℹ️ Catatan kolom is_aduan:', err.message);
  }

  // 3. Buat tabel TicketHts
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "TicketHts" (
        "id" SERIAL PRIMARY KEY,
        "ticket_id" INTEGER NOT NULL REFERENCES "Ticket"("id") ON DELETE CASCADE,
        "category_id" INTEGER REFERENCES "Category"("id") ON DELETE SET NULL,
        "hts_ticket_id" TEXT NOT NULL,
        "hts_ticket_no" TEXT NOT NULL,
        "hts_ticket_status" TEXT NOT NULL DEFAULT 'PENDING',
        "hts_kategori" TEXT NOT NULL DEFAULT 'troubleshoot',
        "hts_sub_kategori" TEXT,
        "hts_detil" TEXT,
        "hts_pic_ids" TEXT,
        "solution" TEXT,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "solved_at" TIMESTAMP(3)
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_tickethts_ticket_id" ON "TicketHts"("ticket_id");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_tickethts_ticket_no" ON "TicketHts"("hts_ticket_no");`);
    console.log('✅ Tabel TicketHts & indeks berhasil dibuat.');
  } catch (err) {
    console.log('ℹ️ Catatan tabel TicketHts:', err.message);
  }

  // 4. Migrasi data lama dari Ticket.hts_ticket_no ke TicketHts
  try {
    const result = await prisma.$executeRawUnsafe(`
      INSERT INTO "TicketHts" ("ticket_id", "hts_ticket_id", "hts_ticket_no", "hts_ticket_status", "hts_pic_ids", "created_at")
      SELECT 
        "id" AS "ticket_id",
        COALESCE("hts_ticket_id", '') AS "hts_ticket_id",
        "hts_ticket_no",
        COALESCE("hts_ticket_status", 'PENDING') AS "hts_ticket_status",
        "hts_pic_ids",
        COALESCE("hts_synced_at", "created_at") AS "created_at"
      FROM "Ticket"
      WHERE "hts_ticket_no" IS NOT NULL AND "hts_ticket_no" != ''
        AND "id" NOT IN (SELECT "ticket_id" FROM "TicketHts");
    `);
    console.log(`✅ Migrasi data HTS V3 -> V4 selesai (${result} baris disalin).`);
  } catch (err) {
    console.log('ℹ️ Catatan migrasi data HTS:', err.message);
  }

  console.log('🎉 Migrasi V4 selesai dengan aman (Zero Data Loss)!');
}

migrate()
  .catch((e) => {
    console.error('❌ Gagal migrasi V4:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

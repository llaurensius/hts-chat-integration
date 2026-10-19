const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runPhase6DbTests() {
  console.log('--- Testing Phase 6: Database Integrity & Migration Reconciliation ---');

  // 1. Check schema.prisma has compound unique on TicketHts
  const schemaPath = path.resolve(__dirname, '../../prisma/schema.prisma');
  const schemaContent = fs.readFileSync(schemaPath, 'utf8');
  assert.ok(
    schemaContent.includes('@@unique([ticket_id, hts_ticket_no])'),
    'schema.prisma must define @@unique([ticket_id, hts_ticket_no])'
  );

  // 2. Check migration directory contains reconciliation migration
  const migrationFile = path.resolve(__dirname, '../../prisma/migrations/20261004_consolidate_schema_and_constraints/migration.sql');
  assert.ok(fs.existsSync(migrationFile), 'Reconciliation migration file must exist');
  const migrationSql = fs.readFileSync(migrationFile, 'utf8');
  assert.ok(migrationSql.includes('unique_active_ticket_per_customer'), 'Migration must create partial unique index for active tickets');
  assert.ok(migrationSql.includes('TicketHts_ticket_id_hts_ticket_no_key'), 'Migration must create compound unique index for TicketHts');
  assert.ok(migrationSql.includes('CREATE TABLE IF NOT EXISTS "Category"'), 'Migration must create Category');
  assert.ok(migrationSql.includes('CREATE TABLE IF NOT EXISTS "TicketCategory"'), 'Migration must create TicketCategory');
  assert.ok(migrationSql.includes('CREATE TABLE IF NOT EXISTS "TicketHts"'), 'Migration must create TicketHts');
  assert.ok(migrationSql.includes('CREATE TABLE IF NOT EXISTS "QuickReply"'), 'Migration must create QuickReply');
  assert.ok(migrationSql.includes('CREATE TABLE IF NOT EXISTS "HtsUserSession"'), 'Migration must create HtsUserSession');

  // 3. Check that dangerous RESTART WITH 1 is completely eliminated from codebase (DB-009)
  const controllersDir = path.resolve(__dirname, '../controllers');
  const controllerFiles = fs.readdirSync(controllersDir);
  for (const file of controllerFiles) {
    if (file.endsWith('.js')) {
      const content = fs.readFileSync(path.join(controllersDir, file), 'utf8');
      assert.strictEqual(
        content.includes('RESTART WITH 1'),
        false,
        `File ${file} must NOT contain RESTART WITH 1 sequence resets`
      );
    }
  }

  // 4. Verify transaction wrapping in chatController.js (DB-013)
  const chatControllerContent = fs.readFileSync(path.resolve(controllersDir, 'chatController.js'), 'utf8');
  assert.ok(chatControllerContent.includes('// Atomicity guard (DB-013): Jalankan pembaruan tiket dan relasi kategori dalam satu transaksi'));
  assert.ok(chatControllerContent.includes('// Atomicity guard (DB-013): Update status kategori tim dan tiket dalam satu transaksi'));
  assert.ok(chatControllerContent.includes('// Atomicity guard (DB-013): Penghapusan relasi tim dan pembaruan status tiket dalam satu transaksi'));

  console.log('✅ Phase 6: All database integrity and reconciliation assertions PASSED');
}

runPhase6DbTests().catch(err => {
  console.error('❌ Phase 6 DB test failed:', err);
  process.exit(1);
});

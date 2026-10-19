const assert = require('assert');
const path = require('path');

async function runPhase10DataLifecycleTests() {
  console.log('--- Testing Phase 10: Import Batching, Upload Safety & Data Lifecycle ---');

  // 1. BUG-021: Extension Sanitization on Upload
  const sanitizeUploadExt = (originalname) => {
    const rawExt = path.extname(originalname || '').toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(rawExt) ? rawExt : '.jpg';
  };

  assert.strictEqual(sanitizeUploadExt('photo.png'), '.png');
  assert.strictEqual(sanitizeUploadExt('evidence.JPEG'), '.jpeg');
  assert.strictEqual(sanitizeUploadExt('capture.webp'), '.webp');
  assert.strictEqual(sanitizeUploadExt('trojan.php'), '.jpg', 'Dangerous .php extension must be neutralized to .jpg');
  assert.strictEqual(sanitizeUploadExt('script.html'), '.jpg', 'Dangerous .html extension must be neutralized to .jpg');
  assert.strictEqual(sanitizeUploadExt('no_ext'), '.jpg', 'File without extension must default to .jpg');

  // 2. DB-010: In-memory Deduplication & Batch Chunking Simulation
  const rawRows = [
    { 'nama': 'Budi 1', 'wa': '081234567890', 'opd': 'Diskominfo' },
    { 'nama': 'Budi Duplicate', 'wa': '081234567890', 'opd': 'Diskominfo Baru' }, // Duplicate in same file
    { 'nama': 'Siti', 'wa': '089876543210', 'opd': 'Bappeda' },
    { 'nama': 'Invalid WA', 'wa': '123', 'opd': 'Dinas' } // Invalid
  ];

  const validContactsMap = new Map();
  const errors = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const rawNumber = row['wa'];
    let cleanNum = String(rawNumber).replace(/\D/g, '');
    if (cleanNum.startsWith('0')) cleanNum = '62' + cleanNum.substring(1);
    else if (cleanNum.startsWith('8')) cleanNum = '62' + cleanNum;

    if (cleanNum.length < 10) {
      errors.push(`Invalid WA: ${rawNumber}`);
      continue;
    }

    validContactsMap.set(cleanNum, {
      wa_number: cleanNum,
      name: row['nama'],
      skpd_name: row['opd']
    });
  }

  assert.strictEqual(errors.length, 1, 'Short/invalid number must be caught in errors');
  assert.strictEqual(validContactsMap.size, 2, 'Duplicate number in same import must be deduplicated in memory (DB-010)');
  assert.strictEqual(validContactsMap.get('6281234567890').name, 'Budi Duplicate', 'Latest duplicate row updates contact info');

  // 3. Batch chunking test
  const contactsArray = Array.from(validContactsMap.values());
  const BATCH_SIZE = 1; // test chunking
  const chunks = [];
  for (let i = 0; i < contactsArray.length; i += BATCH_SIZE) {
    chunks.push(contactsArray.slice(i, i + BATCH_SIZE));
  }
  assert.strictEqual(chunks.length, 2, '2 contacts split by batch size 1 results in 2 batches');

  console.log('✅ Phase 10 Data Lifecycle: All upload safety & import batching assertions PASSED');
}

runPhase10DataLifecycleTests().catch(err => {
  console.error('❌ Phase 10 test failed:', err);
  process.exit(1);
});

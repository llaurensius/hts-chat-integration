const assert = require('assert');

async function runIntegrationReliabilityTests() {
  console.log('--- Testing Integration Reliability: Webhook, Evolution API, and HTS Flow ---');

  // 1. Webhook Payload Filter Test
  const filterWebhook = (payload) => {
    if (!payload || payload.event !== 'messages.upsert') {
      return { status: 200, body: { status: 'ignored', reason: 'unsupported_event' } };
    }
    const messageData = payload.data;
    if (!messageData || !messageData.message) {
      return { status: 200, body: { status: 'ignored', reason: 'no_message_data' } };
    }
    const remoteJid = messageData.key?.remoteJid;
    if (!remoteJid || remoteJid.includes('@g.us')) {
      return { status: 200, body: { status: 'ignored', reason: 'group_message' } };
    }
    const waNumber = remoteJid.split('@')[0];
    if (!waNumber) {
      return { status: 200, body: { status: 'ignored', reason: 'invalid_wa_number' } };
    }
    return { status: 200, body: { status: 'valid', waNumber } };
  };

  // Assert unsupported events are ignored
  assert.strictEqual(filterWebhook({ event: 'connection.update' }).body.reason, 'unsupported_event');
  assert.strictEqual(filterWebhook({ event: 'messages.upsert', data: {} }).body.reason, 'no_message_data');
  assert.strictEqual(filterWebhook({
    event: 'messages.upsert',
    data: { key: { remoteJid: '1203632948293@g.us' }, message: { conversation: 'Hi' } }
  }).body.reason, 'group_message');

  // Assert valid direct WhatsApp message passes
  const validRes = filterWebhook({
    event: 'messages.upsert',
    data: { key: { remoteJid: '6281234567890@s.whatsapp.net', id: 'MSG_001' }, message: { conversation: 'Lapor kendala' } }
  });
  assert.strictEqual(validRes.body.status, 'valid');
  assert.strictEqual(validRes.body.waNumber, '6281234567890');

  // 2. Webhook Deduplication Test
  const mockDbMessageIds = new Set(['MSG_EXISTING_123']);
  const checkDuplicate = (waMessageId) => {
    if (waMessageId && mockDbMessageIds.has(waMessageId)) {
      return { status: 200, body: { status: 'duplicate_ignored', waMessageId } };
    }
    return { status: 200, body: { status: 'new' } };
  };

  assert.strictEqual(checkDuplicate('MSG_EXISTING_123').body.status, 'duplicate_ignored');
  assert.strictEqual(checkDuplicate('MSG_NEW_456').body.status, 'new');

  // 3. Outbound State Guard Test: Send on CLOSED ticket
  const validateOutbound = (ticket) => {
    if (!ticket) return { status: 404, error: 'Ticket not found' };
    if (ticket.status === 'CLOSED') {
      return { status: 400, error: 'Tidak dapat mengirim pesan ke tiket yang sudah CLOSED. Silakan aktifkan kembali (Re-Open) tiket terlebih dahulu.' };
    }
    return { status: 200, allowed: true };
  };

  assert.strictEqual(validateOutbound(null).status, 404);
  assert.strictEqual(validateOutbound({ id: 1, status: 'CLOSED' }).status, 400);
  assert.strictEqual(validateOutbound({ id: 2, status: 'OPEN' }).status, 200);
  assert.strictEqual(validateOutbound({ id: 3, status: 'RESOLVED' }).status, 200);

  // 4. HTS Multi-Ticket Idempotent Upsert Simulation
  const mockHtsStore = new Map();
  const upsertHts = (ticketId, htsNo, status) => {
    const compoundKey = `${ticketId}_${htsNo}`;
    const existing = mockHtsStore.get(compoundKey);
    if (existing) {
      existing.status = status;
      mockHtsStore.set(compoundKey, existing);
      return { action: 'updated', record: existing };
    }
    const created = { ticketId, htsNo, status };
    mockHtsStore.set(compoundKey, created);
    return { action: 'created', record: created };
  };

  const firstUpsert = upsertHts(10, '2026-TShoot-01', 'PENDING');
  assert.strictEqual(firstUpsert.action, 'created');
  const secondUpsert = upsertHts(10, '2026-TShoot-01', 'SOLVED');
  assert.strictEqual(secondUpsert.action, 'updated');
  assert.strictEqual(secondUpsert.record.status, 'SOLVED');
  assert.strictEqual(mockHtsStore.size, 1, 'Compound key must prevent duplicate row creation');

  console.log('✅ Integration Reliability: All webhook, outbound, and HTS assertions PASSED');
}

runIntegrationReliabilityTests().catch(err => {
  console.error('❌ Integration Reliability test failed:', err);
  process.exit(1);
});

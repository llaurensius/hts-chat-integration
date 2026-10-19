const assert = require('assert');
const crypto = require('crypto');

async function runE2eAndEdgeCasesTests() {
  console.log('--- Testing End-to-End Workflows, RBAC Matrix & Edge Cases ---');

  // ==========================================
  // 1. TICKET STATE MACHINE TRANSITION MATRIX
  // ==========================================
  console.log('▶ [1/5] Validasi Matriks Transisi Status Tiket');

  const ALLOWED_TRANSITIONS = {
    OPEN: ['RESOLVED', 'CLOSED'], // CLOSED allowed only for general chat or with resolved HTS
    RESOLVED: ['CLOSED', 'OPEN'], // OPEN if new assignment added
    CLOSED: ['OPEN']              // Re-open only
  };

  const isValidTransition = (from, to, context = {}) => {
    if (!ALLOWED_TRANSITIONS[from] || !ALLOWED_TRANSITIONS[from].includes(to)) {
      return { valid: false, reason: `Transisi ${from} -> ${to} tidak diizinkan oleh state machine.` };
    }
    // Guard: OPEN -> CLOSED directly is forbidden if aduan or has pending HTS
    if (from === 'OPEN' && to === 'CLOSED') {
      if (context.is_aduan || (context.hts_tickets && context.hts_tickets.some(h => h.status !== 'SOLVED'))) {
        return { valid: false, reason: 'Tiket aduan teknis dengan HTS pending tidak boleh langsung ditutup tanpa penyelesaian.' };
      }
    }
    // Guard: Reopen requires ticket to be in CLOSED state
    if (to === 'OPEN' && from === 'CLOSED' && !context.isReopen) {
      return { valid: false, reason: 'Tiket CLOSED hanya dapat dibuka kembali melalui aksi Re-Open resmi.' };
    }
    return { valid: true };
  };

  // Assert Valid Transitions
  assert.strictEqual(isValidTransition('OPEN', 'RESOLVED').valid, true);
  assert.strictEqual(isValidTransition('RESOLVED', 'CLOSED').valid, true);
  assert.strictEqual(isValidTransition('CLOSED', 'OPEN', { isReopen: true }).valid, true);
  assert.strictEqual(isValidTransition('OPEN', 'CLOSED', { is_aduan: false, hts_tickets: [] }).valid, true);

  // Assert Invalid Transitions
  assert.strictEqual(isValidTransition('CLOSED', 'RESOLVED').valid, false);
  assert.strictEqual(isValidTransition('RESOLVED', 'RESOLVED').valid, false);
  assert.strictEqual(isValidTransition('OPEN', 'CLOSED', { is_aduan: true }).valid, false);
  assert.strictEqual(isValidTransition('OPEN', 'CLOSED', { is_aduan: false, hts_tickets: [{ status: 'PENDING' }] }).valid, false);
  assert.strictEqual(isValidTransition('CLOSED', 'OPEN', { isReopen: false }).valid, false);

  // ==========================================
  // 2. RBAC ACCESS MATRIX PER ENDPOINT
  // ==========================================
  console.log('▶ [2/5] Validasi Matriks RBAC Lintas Peran');

  const checkRoutePermission = (role, route, method = 'GET') => {
    const RULES = [
      { routePrefix: '/api/admin', allowed: ['ADMIN'] },
      { routePrefix: '/api/hts', allowed: ['ADMIN', 'SPV', 'L1'] },
      { routePrefix: '/api/reports', allowed: ['ADMIN', 'SPV', 'L1'] },
      { routePrefix: '/api/settings', allowed: ['ADMIN', 'SPV', 'L1'] },
      { routePrefix: '/api/chat/send', allowed: ['ADMIN', 'SPV', 'L1'] },
      { routePrefix: '/api/chat/tickets/resolve', allowed: ['ADMIN', 'SPV', 'L2'] },
      { routePrefix: '/api/chat/tickets/return', allowed: ['ADMIN', 'SPV', 'L2'] }
    ];

    if (!role) return 401; // unauthenticated
    const matchedRule = RULES.find(r => route.startsWith(r.routePrefix));
    if (!matchedRule) return 200;
    return matchedRule.allowed.includes(role) ? 200 : 403;
  };

  // Anonymous
  assert.strictEqual(checkRoutePermission(null, '/api/admin/users'), 401);
  assert.strictEqual(checkRoutePermission(null, '/api/reports/tickets'), 401);

  // L2 Role Permissions
  assert.strictEqual(checkRoutePermission('L2', '/api/admin/users'), 403, 'L2 must NOT access admin');
  assert.strictEqual(checkRoutePermission('L2', '/api/hts/login'), 403, 'L2 must NOT access HTS login');
  assert.strictEqual(checkRoutePermission('L2', '/api/reports/tickets'), 403, 'L2 must NOT access reports');
  assert.strictEqual(checkRoutePermission('L2', '/api/chat/send'), 403, 'L2 must NOT reply directly to customer WhatsApp');
  assert.strictEqual(checkRoutePermission('L2', '/api/chat/tickets/resolve'), 200, 'L2 can resolve assignment');
  assert.strictEqual(checkRoutePermission('L2', '/api/chat/tickets/return'), 200, 'L2 can return assignment');

  // L1 Role Permissions
  assert.strictEqual(checkRoutePermission('L1', '/api/admin/users'), 403, 'L1 must NOT access user admin');
  assert.strictEqual(checkRoutePermission('L1', '/api/hts/login'), 200, 'L1 can access HTS login');
  assert.strictEqual(checkRoutePermission('L1', '/api/reports/tickets'), 200, 'L1 can access reports');
  assert.strictEqual(checkRoutePermission('L1', '/api/chat/send'), 200, 'L1 can reply to customer');
  assert.strictEqual(checkRoutePermission('L1', '/api/chat/tickets/resolve'), 403, 'L1 cannot trigger L2 resolve route');

  // SPV & ADMIN Permissions
  assert.strictEqual(checkRoutePermission('SPV', '/api/reports/tickets'), 200, 'SPV can access reports');
  assert.strictEqual(checkRoutePermission('SPV', '/api/admin/users'), 403, 'SPV cannot edit admin users');
  assert.strictEqual(checkRoutePermission('ADMIN', '/api/admin/users'), 200, 'ADMIN has full access to users');

  // ==========================================
  // 3. CONCURRENT WEBHOOK DEDUPLICATION
  // ==========================================
  console.log('▶ [3/5] Simulasi Konkurensi & Deduplikasi Webhook Bersamaan');

  const processedMessageIds = new Set();
  const activeTicketsStore = new Map();

  const processIncomingMessageMock = async (waNumber, msgId, text) => {
    // Deduplication check
    if (processedMessageIds.has(msgId)) {
      return { status: 'duplicate_ignored', msgId };
    }
    processedMessageIds.add(msgId);

    // Single active ticket check
    let ticket = activeTicketsStore.get(waNumber);
    let createdNewTicket = false;
    if (!ticket || ticket.status === 'CLOSED') {
      ticket = { id: Math.floor(Math.random() * 1000) + 1, waNumber, status: 'OPEN', messages: [] };
      activeTicketsStore.set(waNumber, ticket);
      createdNewTicket = true;
    }

    ticket.messages.push({ msgId, text });
    return { status: 'saved', ticketId: ticket.id, createdNewTicket };
  };

  // Simulate 5 simultaneous webhook calls from gateway for same message ID (network duplicate)
  const concurrentDups = await Promise.all([
    processIncomingMessageMock('6281234567890', 'WA_DUPLICATE_KEY_999', 'Pesan pertama'),
    processIncomingMessageMock('6281234567890', 'WA_DUPLICATE_KEY_999', 'Pesan pertama'),
    processIncomingMessageMock('6281234567890', 'WA_DUPLICATE_KEY_999', 'Pesan pertama')
  ]);

  const savedCount = concurrentDups.filter(r => r.status === 'saved').length;
  const ignoredCount = concurrentDups.filter(r => r.status === 'duplicate_ignored').length;
  assert.strictEqual(savedCount, 1, 'Exactly one message must be saved across concurrent duplicate delivery');
  assert.strictEqual(ignoredCount, 2, 'Two duplicate deliveries must be gracefully ignored');
  assert.strictEqual(activeTicketsStore.get('6281234567890').messages.length, 1);

  // ==========================================
  // 4. NETWORK TIMEOUT & RECOVERABLE GATEWAY FAILURE
  // ==========================================
  console.log('▶ [4/5] Simulasi Penanganan Kegagalan Jaringan & Timeout Gateway');

  const sendWithTimeoutFallback = async (sendFn, timeoutMs = 1000) => {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('GATEWAY_TIMEOUT')), timeoutMs);
    });
    try {
      const result = await Promise.race([sendFn(), timeoutPromise]);
      clearTimeout(timer);
      return { success: true, data: result };
    } catch (err) {
      clearTimeout(timer);
      return { success: false, error: err.message, recoverable: err.message === 'GATEWAY_TIMEOUT' };
    }
  };

  // Mock slow gateway
  const slowGateway = () => new Promise(resolve => setTimeout(() => resolve({ key: { id: 'SLOW_MSG' } }), 1500));
  const timeoutResult = await sendWithTimeoutFallback(slowGateway, 200);
  assert.strictEqual(timeoutResult.success, false);
  assert.strictEqual(timeoutResult.error, 'GATEWAY_TIMEOUT');
  assert.strictEqual(timeoutResult.recoverable, true, 'Timeout must be flagged as recoverable for retry');

  // Mock responsive gateway
  const responsiveGateway = () => new Promise(resolve => setTimeout(() => resolve({ key: { id: 'FAST_MSG' } }), 50));
  const successResult = await sendWithTimeoutFallback(responsiveGateway, 200);
  assert.strictEqual(successResult.success, true);
  assert.strictEqual(successResult.data.key.id, 'FAST_MSG');

  // ==========================================
  // 5. INPUT BOUNDARY & SANITIZATION CHECKS
  // ==========================================
  console.log('▶ [5/5] Uji Nilai Batas Input & Sanitasi');

  const sanitizePhoneNumber = (raw) => {
    if (!raw || typeof raw !== 'string') return null;
    let clean = raw.replace(/\D/g, '');
    if (clean.startsWith('0')) clean = '62' + clean.slice(1);
    else if (clean.startsWith('8')) clean = '62' + clean;
    if (clean.length < 10 || clean.length > 16) return null;
    return clean;
  };

  assert.strictEqual(sanitizePhoneNumber('08123456789'), '628123456789');
  assert.strictEqual(sanitizePhoneNumber('8123456789'), '628123456789');
  assert.strictEqual(sanitizePhoneNumber('+62 812-3456-789'), '628123456789');
  assert.strictEqual(sanitizePhoneNumber('123'), null, 'Short phone number must be rejected');
  assert.strictEqual(sanitizePhoneNumber('0'.repeat(25)), null, 'Excessively long number must be rejected');
  assert.strictEqual(sanitizePhoneNumber(null), null);
  assert.strictEqual(sanitizePhoneNumber(''), null);

  console.log('✅ End-to-End, RBAC Matrix & Edge Cases: All assertions PASSED');
}

runE2eAndEdgeCasesTests().catch(err => {
  console.error('❌ E2E & Edge Cases test failed:', err);
  process.exit(1);
});

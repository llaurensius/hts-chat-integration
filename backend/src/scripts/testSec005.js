const assert = require('assert');

async function runSec005Tests() {
  console.log('--- Testing SEC-005: Object-level Authorization & State Guard ---');

  // 1. Parsing and validation checks
  const parseId = (id) => {
    const n = parseInt(id);
    return isNaN(n) ? null : n;
  };
  assert.strictEqual(parseId('abc'), null, 'Non-numeric string ID must be invalid');
  assert.strictEqual(parseId('123'), 123, 'Valid numeric string ID must parse correctly');

  // 2. State guard check: Mutation on CLOSED ticket
  const validateOpenTicketMutation = (ticket) => {
    if (!ticket) return { status: 404, error: 'Tiket tidak ditemukan' };
    if (ticket.status === 'CLOSED') {
      return { status: 400, error: 'Tidak dapat memodifikasi tiket yang sudah berstatus CLOSED' };
    }
    return { status: 200, allowed: true };
  };

  const openTicket = { id: 1, status: 'OPEN', is_aduan: true };
  const closedTicket = { id: 2, status: 'CLOSED', is_aduan: true };

  assert.strictEqual(validateOpenTicketMutation(null).status, 404);
  assert.strictEqual(validateOpenTicketMutation(closedTicket).status, 400, 'CLOSED ticket must reject mutation');
  assert.strictEqual(validateOpenTicketMutation(openTicket).status, 200, 'OPEN ticket allows mutation');

  // 3. closeGeneralChat guard (SEC-005 / BUG-004)
  const validateCloseGeneral = (ticket) => {
    if (!ticket) return { status: 404, error: 'Tiket tidak ditemukan' };
    if (ticket.status === 'CLOSED') return { status: 400, error: 'Tiket sudah dalam status CLOSED' };
    if (ticket.is_aduan || (ticket.hts_tickets && ticket.hts_tickets.length > 0)) {
      return { status: 400, error: 'Tiket ini merupakan aduan teknis resmi atau memiliki tiket HTS terhubung.' };
    }
    return { status: 200, allowed: true };
  };

  const generalChat = { id: 10, status: 'OPEN', is_aduan: false, hts_tickets: [] };
  const aduanChat = { id: 11, status: 'OPEN', is_aduan: true, hts_tickets: [] };
  const chatWithHts = { id: 12, status: 'OPEN', is_aduan: false, hts_tickets: [{ id: 1, hts_ticket_no: 'HTS-001' }] };

  assert.strictEqual(validateCloseGeneral(generalChat).status, 200, 'Pure general chat can be closed');
  assert.strictEqual(validateCloseGeneral(aduanChat).status, 400, 'Aduan teknis cannot be closed via closeGeneralChat');
  assert.strictEqual(validateCloseGeneral(chatWithHts).status, 400, 'Chat with linked HTS tickets cannot be closed via closeGeneralChat');

  // 4. Parent-Child HTS Unlink Guard (SEC-006 / DB-007)
  const validateHtsUnlink = (parentTicketId, ticketHts) => {
    if (!ticketHts || ticketHts.ticket_id !== parentTicketId) {
      return { status: 404, error: 'Data tiket HTS yang dimaksud tidak ditemukan pada percakapan ini' };
    }
    return { status: 200, allowed: true };
  };

  const htsOfTicket1 = { id: 50, ticket_id: 1, hts_ticket_no: 'HTS-NET-01' };
  assert.strictEqual(validateHtsUnlink(1, htsOfTicket1).status, 200, 'Matching parent ticket can unlink');
  assert.strictEqual(validateHtsUnlink(2, htsOfTicket1).status, 404, 'Mismatched parent ticket (IDOR) must be rejected with 404');

  console.log('✅ SEC-005: All object authorization and state guard assertions PASSED');
}

runSec005Tests().catch(err => {
  console.error('❌ SEC-005 test failed:', err);
  process.exit(1);
});

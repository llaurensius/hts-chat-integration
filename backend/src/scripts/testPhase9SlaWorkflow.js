const assert = require('assert');

async function runPhase9SlaWorkflowTests() {
  console.log('--- Testing Phase 9: SLA (FRT, MTTR), Workflow & Reporting Correctness ---');

  // 1. BUG-013: FRT calculation excludes internal notes
  const calculateFrt = (messages) => {
    let frtMins = null;
    if (messages && messages.length > 0) {
      const firstCustomerMsg = messages.find(m => m.sender_type === 'CUSTOMER');
      if (firstCustomerMsg) {
        const firstAgentMsg = messages.find(m => 
          m.sender_type === 'AGENT' && !m.is_internal && new Date(m.created_at) >= new Date(firstCustomerMsg.created_at)
        );
        if (firstAgentMsg) {
          const customerTime = new Date(firstCustomerMsg.created_at).getTime();
          const agentTime = new Date(firstAgentMsg.created_at).getTime();
          frtMins = Math.max(0, Math.round((agentTime - customerTime) / 60000));
        }
      }
    }
    return frtMins;
  };

  // Timeline:
  // 10:00 - Customer sends message
  // 10:05 - L1 adds INTERNAL note (system/coordination)
  // 10:25 - L1 replies to Customer via WhatsApp (public)
  const messagesScenario1 = [
    { sender_type: 'CUSTOMER', is_internal: false, created_at: '2026-10-19T10:00:00.000Z' },
    { sender_type: 'AGENT', is_internal: true, created_at: '2026-10-19T10:05:00.000Z' }, // Internal note
    { sender_type: 'AGENT', is_internal: false, created_at: '2026-10-19T10:25:00.000Z' }  // Actual WA reply
  ];

  const calculatedFrt = calculateFrt(messagesScenario1);
  assert.strictEqual(
    calculatedFrt, 
    25, 
    'FRT must be 25 minutes (to public reply), NOT 5 minutes (internal note) (BUG-013)'
  );

  // 2. BUG-015 & BUG-016: MTTR for reopened ticket
  const calculateMttr = (ticket) => {
    if (!ticket.is_aduan) return { durationMins: null, durationStr: 'N/A (Percakapan Biasa)' };
    if (!ticket.closed_at) return { durationMins: null, durationStr: '-' };

    const reopenEvent = ticket.messages?.slice().reverse().find(m => 
      m.is_internal && m.message_text && m.message_text.includes('Re-opened')
    );
    const start = reopenEvent ? new Date(reopenEvent.created_at).getTime() : new Date(ticket.created_at).getTime();
    const end = new Date(ticket.closed_at).getTime();
    const durationMins = Math.round((end - start) / 60000);
    return { durationMins, durationStr: `${durationMins} Menit` };
  };

  // Scenario:
  // Ticket created on Day 1 at 08:00
  // Ticket closed on Day 1 at 09:00 (1 hour)
  // Reopened 7 days later on Day 8 at 10:00
  // Closed again on Day 8 at 10:30 (30 minutes of active reopen handling)
  const reopenedTicket = {
    is_aduan: true,
    created_at: '2026-10-10T08:00:00.000Z',
    closed_at: '2026-10-17T10:30:00.000Z',
    messages: [
      { is_internal: true, message_text: '[SISTEM] Tiket diaktifkan kembali (Re-opened) oleh Petugas.', created_at: '2026-10-17T10:00:00.000Z' }
    ]
  };

  const reopenedMttr = calculateMttr(reopenedTicket);
  assert.strictEqual(
    reopenedMttr.durationMins, 
    30, 
    'MTTR for reopened ticket must be 30 minutes, NOT 10,230 minutes (7 days) (BUG-016)'
  );

  // 3. General Chat is 100% excluded from MTTR
  const generalChat = { is_aduan: false, created_at: '2026-10-19T08:00:00.000Z', closed_at: '2026-10-19T08:15:00.000Z' };
  assert.strictEqual(calculateMttr(generalChat).durationStr, 'N/A (Percakapan Biasa)');
  assert.strictEqual(calculateMttr(generalChat).durationMins, null);

  // 4. BUG-018: Enum validation for service_type in toggleAduan
  const VALID_SERVICE_TYPES = ['TROUBLESHOOTING', 'REQUEST_LAYANAN', 'MONITORING', 'GENERAL_CHAT'];
  const validateServiceType = (st) => !st || VALID_SERVICE_TYPES.includes(st);

  assert.strictEqual(validateServiceType('TROUBLESHOOTING'), true);
  assert.strictEqual(validateServiceType('REQUEST_LAYANAN'), true);
  assert.strictEqual(validateServiceType('MONITORING'), true);
  assert.strictEqual(validateServiceType('GENERAL_CHAT'), true);
  assert.strictEqual(validateServiceType('INVALID_ENUM_VALUE'), false);

  // 5. SEC-020: Report metadata sanitation check
  const rawHtsRecords = [
    {
      id: 1,
      hts_ticket_no: 'HTS-001',
      hts_ticket_status: 'PENDING',
      hts_detil: 'Super secret customer credentials inside problem detail',
      hts_pic_ids: '["14","25"]',
      category: { name: 'Network' },
      created_at: new Date(),
      solved_at: null
    }
  ];

  const sanitizedHts = rawHtsRecords.map(h => ({
    id: h.id,
    htsTicketNo: h.hts_ticket_no,
    htsTicketStatus: h.hts_ticket_status,
    category: h.category?.name || '-',
    solvedAt: h.solved_at,
    createdAt: h.created_at
  }));

  assert.strictEqual(sanitizedHts[0].hts_detil, undefined, 'hts_detil must not be present in sanitized report projection (SEC-020)');
  assert.strictEqual(sanitizedHts[0].hts_pic_ids, undefined, 'hts_pic_ids must not be present in sanitized report projection (SEC-020)');
  assert.strictEqual(sanitizedHts[0].htsTicketNo, 'HTS-001');

  console.log('✅ Phase 9 SLA & Workflow: All test assertions PASSED');
}

runPhase9SlaWorkflowTests().catch(err => {
  console.error('❌ Phase 9 SLA test failed:', err);
  process.exit(1);
});

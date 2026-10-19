const assert = require('assert');

async function runSec003Tests() {
  console.log('--- Testing SEC-003: Internal Message Policy & Message History Authorization ---');

  // Mock tickets
  const ticketAduanCat1 = { id: 101, is_aduan: true, categories: [{ category_id: 1 }] };
  const ticketAduanCat2 = { id: 102, is_aduan: true, categories: [{ category_id: 2 }] };
  const ticketGeneral = { id: 103, is_aduan: false, categories: [] };

  // Mock messages
  const allMessages = [
    { id: 1, ticket_id: 101, is_internal: false, text: 'Halo selamat siang' },
    { id: 2, ticket_id: 101, is_internal: true, text: 'Catatan L1: Mohon cek ODP 12' },
    { id: 3, ticket_id: 101, is_internal: true, text: 'Catatan L2: Sedang meluncur' },
    { id: 4, ticket_id: 101, is_internal: false, text: 'Koneksi sudah normal' }
  ];

  // Authorization logic check
  const checkMessageAccess = (user, ticket) => {
    if (!ticket) return { status: 404, error: 'Tiket tidak ditemukan' };
    if (['ADMIN', 'SPV', 'L1'].includes(user.role)) return { status: 200, allowed: true };
    if (user.role === 'L2') {
      if (!user.category_id) {
        return { status: 403, error: 'Akses ditolak: Akun teknisi belum terhubung ke kategori tim' };
      }
      if (!ticket.is_aduan || !(ticket.categories || []).some(c => c.category_id === user.category_id)) {
        return { status: 403, error: 'Akses ditolak: Anda tidak memiliki akses ke percakapan tiket ini' };
      }
      return { status: 200, allowed: true };
    }
    return { status: 403, error: 'Akses ditolak' };
  };

  // 1. Non-existent ticket returns 404
  const resNotFound = checkMessageAccess({ role: 'L1' }, null);
  assert.strictEqual(resNotFound.status, 404, 'Non-existent ticket must return 404');

  // 2. L2 without category returns 403
  const resL2NoCat = checkMessageAccess({ role: 'L2', category_id: null }, ticketAduanCat1);
  assert.strictEqual(resL2NoCat.status, 403, 'L2 without category must be rejected with 403');

  // 3. L2 accessing general chat returns 403
  const resL2General = checkMessageAccess({ role: 'L2', category_id: 1 }, ticketGeneral);
  assert.strictEqual(resL2General.status, 403, 'L2 cannot access general chat');

  // 4. L2 accessing different category returns 403
  const resL2DiffCat = checkMessageAccess({ role: 'L2', category_id: 1 }, ticketAduanCat2);
  assert.strictEqual(resL2DiffCat.status, 403, 'L2 cannot access tickets assigned to other categories');

  // 5. L2 accessing assigned category returns 200
  const resL2Assigned = checkMessageAccess({ role: 'L2', category_id: 1 }, ticketAduanCat1);
  assert.strictEqual(resL2Assigned.status, 200, 'L2 can access assigned category ticket');

  // 6. Admin, SPV, L1 have full access
  assert.strictEqual(checkMessageAccess({ role: 'ADMIN' }, ticketAduanCat2).status, 200);
  assert.strictEqual(checkMessageAccess({ role: 'SPV' }, ticketGeneral).status, 200);
  assert.strictEqual(checkMessageAccess({ role: 'L1' }, ticketAduanCat1).status, 200);

  // 7. Internal note filter logic
  const filterMessages = (messages, query = {}) => {
    if (query.include_internal === 'false' || query.internal === 'false') {
      return messages.filter(m => !m.is_internal);
    }
    return messages;
  };

  const publicOnly = filterMessages(allMessages, { include_internal: 'false' });
  assert.strictEqual(publicOnly.length, 2, 'Filtered messages should only contain public messages');
  assert.ok(publicOnly.every(m => !m.is_internal), 'No internal messages in public export');

  const withInternal = filterMessages(allMessages, {});
  assert.strictEqual(withInternal.length, 4, 'Default should include all messages for authorized staff');

  console.log('✅ SEC-003: All internal message policy assertions PASSED');
}

runSec003Tests().catch(err => {
  console.error('❌ SEC-003 test failed:', err);
  process.exit(1);
});

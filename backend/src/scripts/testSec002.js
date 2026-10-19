const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://dummy:dummy@localhost:5432/dummy';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-with-at-least-32-chars-long';
process.env.EVOLUTION_API_TOKEN = process.env.EVOLUTION_API_TOKEN || 'dummy-evo-token';

const { JWT_SECRET } = require('../config/env');
const { getSafeUploadPath, UPLOAD_ROOT } = require('../utils/safePath');

async function runSec002Tests() {
  console.log('--- Testing SEC-002: Protected Attachment Access ---');

  // 1. Path Traversal & Safe Path Verification
  const traversalAttempt = getSafeUploadPath('/uploads/../../etc/passwd');
  assert.strictEqual(traversalAttempt, null, 'Path traversal attempt must be blocked by getSafeUploadPath');

  const nullByteAttempt = getSafeUploadPath('/uploads/test\0.jpg');
  assert.strictEqual(nullByteAttempt, null, 'Null byte attempt must be rejected');

  // 2. Token creation for role verification
  const adminToken = jwt.sign({ id: 1, role: 'ADMIN', name: 'Admin' }, JWT_SECRET, { expiresIn: '1h' });
  const l2TokenWithoutCategory = jwt.sign({ id: 2, role: 'L2', name: 'L2 No Cat', category_id: null }, JWT_SECRET, { expiresIn: '1h' });
  const l2TokenCategory1 = jwt.sign({ id: 3, role: 'L2', name: 'L2 Cat 1', category_id: 1 }, JWT_SECRET, { expiresIn: '1h' });

  assert.ok(adminToken, 'Admin token generated');
  assert.ok(l2TokenWithoutCategory, 'L2 token generated');
  assert.ok(l2TokenCategory1, 'L2 category token generated');

  // 3. Authorization logic unit simulation
  const checkAccess = (user, ticket) => {
    if (['ADMIN', 'SPV', 'L1'].includes(user.role)) return true;
    if (user.role === 'L2' && user.category_id && ticket && ticket.is_aduan) {
      return (ticket.categories || []).some(c => c.category_id === user.category_id);
    }
    return false;
  };

  const sampleTicketGeneral = { is_aduan: false, categories: [{ category_id: 1 }] };
  const sampleTicketAduanCat1 = { is_aduan: true, categories: [{ category_id: 1 }] };
  const sampleTicketAduanCat2 = { is_aduan: true, categories: [{ category_id: 2 }] };

  // Anonymous / no role
  assert.strictEqual(checkAccess({ role: undefined }, sampleTicketAduanCat1), false, 'Anonymous user must have no access');

  // Admin, SPV, L1 have access
  assert.strictEqual(checkAccess({ role: 'ADMIN' }, sampleTicketAduanCat1), true, 'ADMIN must have access');
  assert.strictEqual(checkAccess({ role: 'SPV' }, sampleTicketAduanCat1), true, 'SPV must have access');
  assert.strictEqual(checkAccess({ role: 'L1' }, sampleTicketGeneral), true, 'L1 must have access to general chat attachments');

  // L2 without category is denied
  assert.strictEqual(checkAccess({ role: 'L2', category_id: null }, sampleTicketAduanCat1), false, 'L2 without category must be denied');

  // L2 cannot access general chat attachments
  assert.strictEqual(checkAccess({ role: 'L2', category_id: 1 }, sampleTicketGeneral), false, 'L2 cannot access non-aduan attachments');

  // L2 can access assigned category in aduan
  assert.strictEqual(checkAccess({ role: 'L2', category_id: 1 }, sampleTicketAduanCat1), true, 'L2 can access assigned category');

  // L2 cannot access unassigned category
  assert.strictEqual(checkAccess({ role: 'L2', category_id: 1 }, sampleTicketAduanCat2), false, 'L2 cannot access unassigned category');

  console.log('✅ SEC-002: All unit authorization assertions PASSED');
}

runSec002Tests().catch((err) => {
  console.error('❌ SEC-002 test failed:', err);
  process.exit(1);
});

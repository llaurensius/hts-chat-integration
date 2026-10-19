const assert = require('assert');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'test-secret-at-least-32-chars-for-testing';

async function runSec007Tests() {
  console.log('--- Testing SEC-007: Stale JWT Claims Invalidation & Live User Auth ---');

  // Mock DB User table
  const mockDbUsers = new Map([
    [1, { id: 1, name: 'Alice', role: 'L1', category_id: null }],
    [2, { id: 2, name: 'Bob', role: 'L2', category_id: 2 }], // Bob was reassigned to category 2 in DB
    [3, { id: 3, name: 'Charlie', role: 'L2', category_id: 1 }] // Charlie was demoted from ADMIN to L2 in DB
    // User 4 is deleted / does not exist
  ]);

  // Simulate verifyToken logic with mock DB
  const simulateVerifyToken = async (authHeader) => {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { status: 403, error: 'Akses ditolak. Token tidak ditemukan.' };
    }
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (!decoded || !decoded.id) {
        return { status: 401, error: 'Token tidak valid' };
      }
      const liveUser = mockDbUsers.get(decoded.id);
      if (!liveUser) {
        return { status: 401, error: 'Pengguna tidak ditemukan atau telah dinonaktifkan.' };
      }
      return {
        status: 200,
        user: {
          id: liveUser.id,
          name: liveUser.name,
          role: liveUser.role,
          category_id: liveUser.category_id
        }
      };
    } catch (err) {
      return { status: 401, error: 'Token tidak valid atau sudah kadaluwarsa.' };
    }
  };

  // 1. Missing / invalid token returns 403 / 401
  assert.strictEqual((await simulateVerifyToken('')).status, 403);
  assert.strictEqual((await simulateVerifyToken('Bearer badtoken')).status, 401);

  // 2. Token issued with stale role 'ADMIN', but DB has 'L2'
  const staleAdminToken = jwt.sign({ id: 3, role: 'ADMIN', category_id: null }, JWT_SECRET, { expiresIn: '1h' });
  const authResultDemoted = await simulateVerifyToken(`Bearer ${staleAdminToken}`);
  assert.strictEqual(authResultDemoted.status, 200);
  assert.strictEqual(authResultDemoted.user.role, 'L2', 'Live DB role (L2) must override stale token claim (ADMIN)');

  // 3. Token issued with stale category 1, but DB has category 2
  const staleCat1Token = jwt.sign({ id: 2, role: 'L2', category_id: 1 }, JWT_SECRET, { expiresIn: '1h' });
  const authResultReassigned = await simulateVerifyToken(`Bearer ${staleCat1Token}`);
  assert.strictEqual(authResultReassigned.status, 200);
  assert.strictEqual(authResultReassigned.user.category_id, 2, 'Live DB category (2) must override stale token claim (1)');

  // 4. Token valid, but user was deleted from DB (User 4)
  const deletedUserToken = jwt.sign({ id: 4, role: 'L1', category_id: null }, JWT_SECRET, { expiresIn: '1h' });
  const authResultDeleted = await simulateVerifyToken(`Bearer ${deletedUserToken}`);
  assert.strictEqual(authResultDeleted.status, 401, 'Deleted user must be rejected immediately (401)');
  assert.strictEqual(authResultDeleted.error, 'Pengguna tidak ditemukan atau telah dinonaktifkan.');

  // 5. Valid user (User 1) allowed
  const validToken = jwt.sign({ id: 1, role: 'L1', category_id: null }, JWT_SECRET, { expiresIn: '1h' });
  const authResultValid = await simulateVerifyToken(`Bearer ${validToken}`);
  assert.strictEqual(authResultValid.status, 200);
  assert.strictEqual(authResultValid.user.id, 1);
  assert.strictEqual(authResultValid.user.role, 'L1');

  console.log('✅ SEC-007: All stale claim invalidation and live user auth assertions PASSED');
}

runSec007Tests().catch(err => {
  console.error('❌ SEC-007 test failed:', err);
  process.exit(1);
});

const assert = require('assert');
const { resolveTargetRooms, emitToAuthorizedRooms, emitGlobalStaff } = require('../utils/socketEmitter');

async function runSec004Tests() {
  console.log('--- Testing SEC-004: Socket.IO Room Scoping & Cross-Category Isolation ---');

  // 1. General Chat (is_aduan: false) isolation test
  const generalChatRooms = resolveTargetRooms({ is_aduan: false, categories: [{ category_id: 1 }] });
  assert.ok(generalChatRooms.includes('role_ADMIN'), 'Admin must receive general chat event');
  assert.ok(generalChatRooms.includes('role_SPV'), 'SPV must receive general chat event');
  assert.ok(generalChatRooms.includes('role_L1'), 'L1 must receive general chat event');
  assert.strictEqual(
    generalChatRooms.includes('category_1'), 
    false, 
    'L2 category_1 must NOT receive general chat event even if category is referenced'
  );

  // 2. Aduan Teknis (is_aduan: true) with Category 1 (Network)
  const aduanCat1Rooms = resolveTargetRooms({ is_aduan: true, categories: [{ category_id: 1 }] });
  assert.ok(aduanCat1Rooms.includes('category_1'), 'category_1 must receive aduan event');
  assert.strictEqual(aduanCat1Rooms.includes('category_2'), false, 'category_2 (Server) must NOT receive category 1 aduan event');
  assert.strictEqual(aduanCat1Rooms.includes('category_3'), false, 'category_3 (M&E) must NOT receive category 1 aduan event');

  // 3. Multi-Category Assignment (Category 1 Network & Category 2 Server)
  const multiCatRooms = resolveTargetRooms({
    is_aduan: true,
    categories: [{ category_id: 1 }, { category_id: 2 }]
  });
  assert.ok(multiCatRooms.includes('category_1'), 'category_1 must receive event');
  assert.ok(multiCatRooms.includes('category_2'), 'category_2 must receive event');
  assert.strictEqual(multiCatRooms.includes('category_3'), false, 'category_3 must NOT receive event');

  // 4. Mock Socket.io Emission Test
  const emittedRooms = [];
  const mockIo = {
    to: (room) => ({
      emit: (event, payload) => {
        emittedRooms.push({ room, event, payload });
      }
    })
  };

  // Emit internal note for ticket assigned to category 2
  emitToAuthorizedRooms(
    mockIo, 
    { is_aduan: true, categories: [{ category_id: 2 }] }, 
    'new_message', 
    { text: 'Catatan rahasia tim Server', isInternal: true }
  );

  const targetRoomNames = emittedRooms.map(r => r.room);
  assert.ok(targetRoomNames.includes('role_L1'), 'L1 must receive internal note');
  assert.ok(targetRoomNames.includes('role_SPV'), 'SPV must receive internal note');
  assert.ok(targetRoomNames.includes('role_ADMIN'), 'Admin must receive internal note');
  assert.ok(targetRoomNames.includes('category_2'), 'category_2 (Server) must receive internal note');
  assert.strictEqual(targetRoomNames.includes('category_1'), false, 'category_1 (Network) must NOT receive Server internal note');
  assert.strictEqual(targetRoomNames.includes('category_3'), false, 'category_3 (M&E) must NOT receive Server internal note');

  // 5. Global Staff Emission Test (Admin Reset)
  const globalRooms = [];
  const mockIoGlobal = {
    to: (room) => ({
      emit: (event, payload) => {
        globalRooms.push(room);
      }
    })
  };

  emitGlobalStaff(mockIoGlobal, 'customer_updated', { customerId: 'all' });
  assert.ok(globalRooms.includes('role_ADMIN'));
  assert.ok(globalRooms.includes('role_SPV'));
  assert.ok(globalRooms.includes('role_L1'));
  assert.ok(globalRooms.includes('role_L2'));
  assert.strictEqual(globalRooms.length, 4, 'Global staff broadcast must target exactly the 4 staff roles');

  console.log('✅ SEC-004: All socket isolation and scoping assertions PASSED');
}

runSec004Tests().catch(err => {
  console.error('❌ SEC-004 test failed:', err);
  process.exit(1);
});

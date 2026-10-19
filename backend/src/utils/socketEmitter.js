/**
 * Socket.IO Room Scoping & Isolation Utility (SEC-004)
 * 
 * Membatasi siaran data sensitif (catatan internal, pesan pelanggan, HTS, dan pembaruan tiket)
 * agar tidak disiarkan secara global ke seluruh staf yang terhubung.
 * 
 * Aturan Otorisasi:
 * 1. ADMIN, SPV, dan L1 (Dispatcher) menerima seluruh pembaruan operasional via role rooms:
 *    ['role_ADMIN', 'role_SPV', 'role_L1'].
 * 2. Teknisi L2 HANYA menerima event jika tiket bertipe aduan teknis (is_aduan === true)
 *    dan HANYA untuk room kategori tim yang secara resmi ditugaskan ('category_${id}').
 * 3. Percakapan biasa (is_aduan === false) 100% terisolasi dari seluruh teknisi L2.
 */

const STAFF_ADMIN_ROOMS = ['role_ADMIN', 'role_SPV', 'role_L1'];

/**
 * Resolusi daftar room yang berhak menerima event tiket.
 * @param {object} ticketInfo - Objek tiket atau { is_aduan, categories, categoryIds }
 * @returns {string[]} Array nama room tujuan
 */
const resolveTargetRooms = (ticketInfo = {}) => {
  const rooms = new Set(STAFF_ADMIN_ROOMS);

  const isAduan = Boolean(
    ticketInfo.is_aduan ?? 
    ticketInfo.isAduan ?? 
    (ticketInfo.service_type && ticketInfo.service_type !== 'GENERAL_CHAT')
  );

  if (isAduan) {
    const categories = ticketInfo.categories || ticketInfo.categoryIds || [];
    if (Array.isArray(categories)) {
      categories.forEach(item => {
        const catId = typeof item === 'object' && item !== null
          ? (item.category_id || item.id)
          : item;
        const parsed = parseInt(catId);
        if (!isNaN(parsed) && parsed > 0) {
          rooms.add(`category_${parsed}`);
        }
      });
    } else {
      const parsed = parseInt(categories);
      if (!isNaN(parsed) && parsed > 0) {
        rooms.add(`category_${parsed}`);
      }
    }
  }

  return Array.from(rooms);
};

/**
 * Emit event secara terisolasi ke room yang terotorisasi.
 * @param {object} io - Objek Socket.IO (req.io)
 * @param {object} ticketInfo - Data tiket penentu otorisasi
 * @param {string} event - Nama event (misal 'new_message', 'ticket_updated')
 * @param {object} payload - Payload event
 */
const emitToAuthorizedRooms = (io, ticketInfo, event, payload) => {
  if (!io) return;
  const targetRooms = resolveTargetRooms(ticketInfo);
  targetRooms.forEach(room => {
    io.to(room).emit(event, payload);
  });
};

/**
 * Emit broadcast sistem khusus yang relevan untuk seluruh staf terotentikasi
 * (contoh: reset kontak massal oleh Admin).
 */
const emitGlobalStaff = (io, event, payload) => {
  if (!io) return;
  ['role_ADMIN', 'role_SPV', 'role_L1', 'role_L2'].forEach(room => {
    io.to(room).emit(event, payload);
  });
};

module.exports = {
  STAFF_ADMIN_ROOMS,
  resolveTargetRooms,
  emitToAuthorizedRooms,
  emitGlobalStaff
};

/**
 * In-memory lock per key (misal: per nomor WhatsApp) untuk menserialisasikan
 * eksekusi event webhook yang masuk bersamaan dan mencegah bentrok konkurensi (DATA-01).
 */
const chains = new Map();

/**
 * Menjalankan fungsi `fn` secara serial berdasarkan `key`.
 * Permintaan dengan key yang sama akan mengantre dan dieksekusi berurutan.
 * Permintaan dengan key berbeda dieksekusi paralel tanpa hambatan.
 *
 * @param {string} key - Identifier unik (contoh: "wa:628123456789")
 * @param {Function} fn - Fungsi async yang akan dijalankan
 * @returns {Promise<any>}
 */
const withLock = (key, fn) => {
  const prev = chains.get(key) || Promise.resolve();
  const run = prev.then(fn, fn);
  chains.set(key, run.catch(() => {}));
  run.finally(() => {
    if (chains.get(key) === run) {
      chains.delete(key);
    }
  });
  return run;
};

module.exports = { withLock };

const path = require('path');
const fs = require('fs');

const UPLOAD_ROOT = path.resolve(__dirname, '../../uploads');

// Pastikan direktori uploads ada
if (!fs.existsSync(UPLOAD_ROOT)) {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

/**
 * Validasi dan resolusi path aman untuk file lampiran upload (SEC-04).
 * Mencegah Directory Traversal (misal: "../", "..\\", null bytes).
 * Mengembalikan path absolut jika aman dan file ada di direktori uploads; jika tidak, return null.
 *
 * @param {string} url - URL atau nama file (contoh: "/uploads/img_123.jpg")
 * @returns {string|null} - Path absolut file aman, atau null jika tidak aman / tidak ditemukan
 */
const getSafeUploadPath = (url) => {
  if (typeof url !== 'string' || !url.trim()) return null;

  // 1. Bersihkan null bytes & whitespace
  let cleanInput = url.trim().replace(/\0/g, '');

  // 2. Hilangkan prefix URL /uploads/ atau uploads/
  let relativePath = cleanInput.replace(/^(\/|\\)?uploads(\/|\\)/i, '').replace(/^(\/|\\)/, '');

  // 3. Resolusi ke path absolut kanonikal
  const resolvedPath = path.resolve(UPLOAD_ROOT, relativePath);

  // 4. Confinement check: resolvedPath HARUS berada di dalam UPLOAD_ROOT
  const rootWithSep = UPLOAD_ROOT.endsWith(path.sep) ? UPLOAD_ROOT : UPLOAD_ROOT + path.sep;
  if (!resolvedPath.startsWith(rootWithSep)) {
    console.warn(`[Security Alert - SEC-04] Upaya Path Traversal diblokir: "${url}" -> "${resolvedPath}"`);
    return null;
  }

  // 5. Pastikan file ada dan bukan direktori
  if (!fs.existsSync(resolvedPath)) {
    return null;
  }

  try {
    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile()) return null;
  } catch {
    return null;
  }

  return resolvedPath;
};

/**
 * Sanitasi URL lampiran untuk disimpan ke database / diteruskan ke layanan HTS.
 * Hanya mengembalikan format aman "/uploads/<filename>".
 */
const sanitizeAttachmentUrl = (rawUrl) => {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
  const safePath = getSafeUploadPath(rawUrl);
  if (!safePath) return null;
  return `/uploads/${path.basename(safePath)}`;
};

module.exports = {
  UPLOAD_ROOT,
  getSafeUploadPath,
  sanitizeAttachmentUrl
};

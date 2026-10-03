const crypto = require('crypto');

/**
 * Constant-time string comparison to prevent timing attacks.
 */
const safeCompare = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

/**
 * Middleware untuk validasi autentikasi webhook WhatsApp (Evolution API).
 * Memeriksa header 'apikey', 'x-api-key', 'authorization: Bearer <token>', atau query parameter 'token'.
 * Harus cocok dengan WEBHOOK_SECRET atau EVOLUTION_API_TOKEN.
 */
const verifyWebhookAuth = (req, res, next) => {
  const validSecrets = [process.env.WEBHOOK_SECRET, process.env.EVOLUTION_API_TOKEN]
    .filter(Boolean)
    .map(s => String(s).trim());

  if (validSecrets.length === 0) {
    console.error('[Webhook Security] Neither WEBHOOK_SECRET nor EVOLUTION_API_TOKEN is set in environment!');
    return res.status(500).json({ error: 'Server misconfiguration: Webhook secret not configured.' });
  }

  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  const candidateKey = 
    req.headers['apikey'] || 
    req.headers['x-api-key'] || 
    bearerToken || 
    req.query?.token;

  const isValid = candidateKey && validSecrets.some(sec => safeCompare(String(candidateKey).trim(), sec));

  if (!isValid) {
    console.warn(`[Webhook Security] Unauthorized webhook attempt rejected from IP ${req.ip}`);
    return res.status(401).json({ error: 'Akses webhook ditolak: Token autentikasi tidak valid atau tidak disertakan.' });
  }

  next();
};

module.exports = { verifyWebhookAuth };

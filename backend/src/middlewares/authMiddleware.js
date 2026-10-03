const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(403).json({ error: 'Akses ditolak. Token tidak ditemukan.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // Berisi id, role, category_id
    next();
  } catch (error) {
    console.error('[Auth Middleware] Invalid Token:', error.message);
    return res.status(401).json({ error: 'Token tidak valid atau sudah kadaluwarsa.' });
  }
};

// Middleware opsional untuk membatasi akses berdasarkan Role (RBAC)
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Akses ditolak. Anda tidak memiliki wewenang.' });
    }
    next();
  };
};

module.exports = { verifyToken, requireRole };

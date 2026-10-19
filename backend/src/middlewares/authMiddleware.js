const prisma = require('../config/db');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(403).json({ error: 'Akses ditolak. Token tidak ditemukan.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || !decoded.id) {
      return res.status(401).json({ error: 'Token tidak valid atau sudah kadaluwarsa.' });
    }

    // Resolusi status dan hak akses pengguna secara real-time dari database (SEC-007)
    const liveUser = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, name: true, role: true, category_id: true }
    });

    if (!liveUser) {
      return res.status(401).json({ error: 'Pengguna tidak ditemukan atau telah dinonaktifkan.' });
    }

    req.user = {
      id: liveUser.id,
      name: liveUser.name,
      role: liveUser.role,
      category_id: liveUser.category_id
    };
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

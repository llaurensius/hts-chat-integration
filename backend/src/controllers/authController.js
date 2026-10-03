const prisma = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Cari user berdasarkan email
    const user = await prisma.user.findUnique({
      where: { email },
      include: { category: true }
    });

    if (!user) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    // Cek password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    // Buat JWT Token (Sertakan role dan category_id untuk RBAC)
    const token = jwt.sign(
      { 
        id: user.id, 
        name: user.name,
        role: user.role, 
        category_id: user.category_id 
      }, 
      JWT_SECRET, 
      { expiresIn: '12h' }
    );

    // Kirim response
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        category_id: user.category_id,
        category: user.category ? user.category.name : null
      }
    });
  } catch (error) {
    console.error('[Auth API] Login Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getMe = async (req, res) => {
  // Dipanggil dari frontend untuk mengecek user yang sedang login
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, role: true, category_id: true, category: true }
    });
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      category_id: user.category_id,
      category: user.category ? user.category.name : null
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { login, getMe };

const prisma = require('../config/db');
const bcrypt = require('bcryptjs');

// Mengambil semua user beserta kategorinya
const getUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: { category: true },
      orderBy: { id: 'asc' }
    });
    // Jangan kirim password ke frontend
    const safeUsers = users.map(u => {
      const { password, ...safeUser } = u;
      return safeUser;
    });
    res.json(safeUsers);
  } catch (error) {
    console.error('[Admin API] Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Menambahkan user baru
const createUser = async (req, res) => {
  const { name, email, password, role, category_id } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'Data wajib diisi (name, email, password, role)' });
  }

  try {
    // Cek apakah email sudah ada
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'Email sudah digunakan' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        category_id: category_id ? parseInt(category_id) : null
      }
    });

    const { password: _, ...safeUser } = newUser;
    res.json({ success: true, user: safeUser });
  } catch (error) {
    console.error('[Admin API] Error creating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Menghapus user
const deleteUser = async (req, res) => {
  const { id } = req.params;
  try {
    // Cek dulu
    const user = await prisma.user.findUnique({ where: { id: parseInt(id) } });
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });

    // Cegah admin menghapus dirinya sendiri
    if (user.id === req.user.id) {
      return res.status(400).json({ error: 'Tidak dapat menghapus akun Anda sendiri' });
    }

    await prisma.user.delete({ where: { id: parseInt(id) } });
    res.json({ success: true, message: 'User berhasil dihapus' });
  } catch (error) {
    console.error('[Admin API] Error deleting user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { getUsers, createUser, deleteUser };

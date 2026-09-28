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

// Mengambil daftar kategori beserta multi-kontak WA Blast
const getCategoryContacts = async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        contacts: {
          orderBy: { id: 'asc' }
        }
      },
      orderBy: { id: 'asc' }
    });
    res.json(categories);
  } catch (error) {
    console.error('[Admin API] Error fetching category contacts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Menambahkan kontak baru ke kategori tim L2
const addCategoryContact = async (req, res) => {
  const { categoryId } = req.params;
  const { name, wa_target } = req.body;

  if (!name || !wa_target) {
    return res.status(400).json({ error: 'Nama dan Nomor WA / ID Grup wajib diisi' });
  }

  try {
    const category = await prisma.category.findUnique({
      where: { id: parseInt(categoryId) }
    });

    if (!category) return res.status(404).json({ error: 'Kategori tim tidak ditemukan' });

    // Format nomor jika nomor pribadi biasa (bukan ID grup @g.us)
    let formattedTarget = wa_target.trim();
    if (!formattedTarget.includes('@g.us')) {
      formattedTarget = formattedTarget.replace(/[^0-9]/g, '');
      if (formattedTarget.startsWith('0')) {
        formattedTarget = '62' + formattedTarget.slice(1);
      }
    }

    const contact = await prisma.categoryContact.create({
      data: {
        category_id: category.id,
        name: name.trim(),
        wa_target: formattedTarget
      }
    });

    res.json({ success: true, contact });
  } catch (error) {
    console.error('[Admin API] Error adding category contact:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Menghapus kontak dari kategori tim L2
const deleteCategoryContact = async (req, res) => {
  const { contactId } = req.params;
  const parsedId = parseInt(contactId, 10);
  if (isNaN(parsedId)) {
    return res.status(400).json({ error: 'ID kontak tidak valid' });
  }

  try {
    await prisma.categoryContact.delete({
      where: { id: parsedId }
    });
    res.json({ success: true, message: 'Kontak berhasil dihapus' });
  } catch (error) {
    console.error('[Admin API] Error deleting category contact:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Memperbarui kontak kategori tim L2
const updateCategoryContact = async (req, res) => {
  const { contactId } = req.params;
  const { name, wa_target } = req.body;
  const parsedId = parseInt(contactId, 10);

  if (isNaN(parsedId)) {
    return res.status(400).json({ error: 'ID kontak tidak valid' });
  }

  if (!name || !wa_target) {
    return res.status(400).json({ error: 'Nama dan nomor target WhatsApp wajib diisi' });
  }

  try {
    let formattedTarget = wa_target.trim();
    if (!formattedTarget.endsWith('@g.us')) {
      formattedTarget = formattedTarget.replace(/[^0-9]/g, '');
      if (formattedTarget.startsWith('0')) {
        formattedTarget = '62' + formattedTarget.slice(1);
      }
    }

    const contact = await prisma.categoryContact.update({
      where: { id: parsedId },
      data: {
        name: name.trim(),
        wa_target: formattedTarget
      }
    });

    res.json({ success: true, contact });
  } catch (error) {
    console.error('[Admin API] Error updating category contact:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getUsers,
  createUser,
  deleteUser,
  getCategoryContacts,
  addCategoryContact,
  deleteCategoryContact,
  updateCategoryContact
};


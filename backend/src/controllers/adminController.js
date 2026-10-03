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

// Memperbarui akun user (Edit Akun)
const updateUser = async (req, res) => {
  const { id } = req.params;
  const { name, email, password, role, category_id } = req.body;

  if (!name || !email || !role) {
    return res.status(400).json({ error: 'Data wajib diisi (name, email, role)' });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { id: parseInt(id) } });
    if (!existing) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }

    // Cek jika email diganti dan sudah digunakan oleh akun lain
    if (email !== existing.email) {
      const emailTaken = await prisma.user.findUnique({ where: { email } });
      if (emailTaken) {
        return res.status(400).json({ error: 'Email sudah digunakan oleh akun lain' });
      }
    }

    const updateData = {
      name,
      email,
      role,
      category_id: role === 'L2' && category_id ? parseInt(category_id) : null
    };

    // Jika password diisi, update password hash (opsional saat edit akun)
    if (password && password.trim()) {
      updateData.password = await bcrypt.hash(password.trim(), 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: { category: true }
    });

    const { password: _, ...safeUser } = updatedUser;
    res.json({ success: true, user: safeUser, message: 'Akun pengguna berhasil diperbarui' });
  } catch (error) {
    console.error('[Admin API] Error updating user:', error);
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



const xlsx = require('xlsx');

// Menghapus SEMUA data kontak pelanggan / master data (Khusus ADMIN)
const clearAllCustomerContacts = async (req, res) => {
  try {
    // 1. Cek apakah ada tiket yang sedang aktif
    const activeTicketsCount = await prisma.ticket.count({
      where: { status: { in: ['OPEN', 'RESOLVED'] } }
    });
    const totalTicketsCount = await prisma.ticket.count();

    if (totalTicketsCount > 0 && !req.body.force) {
      return res.status(400).json({
        requires_force: true,
        error: `Terdapat ${totalTicketsCount} data riwayat tiket (${activeTicketsCount} aktif). Anda harus menggunakan opsi Hapus Paksa (Force Delete) untuk membersihkan seluruh data pelanggan beserta tiket terkait.`
      });
    }

    // 2. Hapus seluruh data Customer (dan tiket/pesan terkait jika force)
    await prisma.$transaction(async (tx) => {
      if (req.body.force) {
        await tx.ticketHts.deleteMany();
        await tx.message.deleteMany();
        await tx.ticketCategory.deleteMany();
        await tx.ticket.deleteMany();
        await tx.$executeRawUnsafe('ALTER SEQUENCE "Ticket_id_seq" RESTART WITH 1');
        await tx.$executeRawUnsafe('ALTER SEQUENCE "Message_id_seq" RESTART WITH 1');
      }
      await tx.customer.deleteMany();
      await tx.$executeRawUnsafe('ALTER SEQUENCE "Customer_id_seq" RESTART WITH 1');
    });

    if (req.io) {
      req.io.emit('customer_updated', { customerId: 'all' });
      req.io.emit('ticket_closed', { ticketId: 'all' });
    }

    res.json({
      success: true,
      message: 'Seluruh data master kontak pelanggan berhasil dihapus bersih dan ID di-reset ke 1.'
    });
  } catch (error) {
    console.error('[Admin API] Error clearing customer contacts:', error);
    res.status(500).json({ error: error.message || 'Gagal menghapus data kontak pelanggan' });
  }
};

// Parser sederhana vCard (.vcf) - tanpa library tambahan
const parseVcfToRows = (text) => {
  const cards = String(text).split(/BEGIN:VCARD/i).slice(1);
  const rows = [];
  for (const card of cards) {
    const block = card.split(/END:VCARD/i)[0] || '';
    const lines = block.split(/\r?\n/);
    let name = '', org = '';
    const nums = [];
    for (const line of lines) {
      const idx = line.indexOf(':');
      if (idx < 1) continue;
      const key = line.slice(0, idx).split(';')[0].trim().toUpperCase();
      let val = line.slice(idx + 1).trim();
      if (key === 'FN' && val && !name) name = val;
      else if (key === 'N' && !name && val) name = val.split(';').filter(Boolean).slice(0, 3).reverse().join(' ').trim();
      else if (key === 'ORG' && val && !org) org = val.split(';').filter(Boolean).join(' - ');
      else if (key === 'TEL' && val) nums.push(val);
    }
    // Satu kontak bisa punya beberapa TEL -> buat 1 baris per nomor
    const phoneList = nums.length ? nums : [''];
    for (const tel of phoneList) rows.push({ 'Name': name, 'Phone 1 - Value': tel, 'Organization Name': org });
  }
  return rows;
};

// Import Master Data Kontak Pelanggan / OPD (Khusus ADMIN - Prioritas Utama)
const importCustomerContacts = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'File Excel (.xlsx/.xls), CSV, atau VCF wajib diunggah' });
  }

  try {
    const originalName = (req.file.originalname || '').toLowerCase();
    const buffer = req.file.buffer;
    const isVcf = originalName.endsWith('.vcf') || originalName.endsWith('.vcard') ||
      (buffer && buffer.slice(0, 40).toString('utf8').trimStart().toUpperCase().startsWith('BEGIN:VCARD'));

    let rows;
    if (isVcf) {
      rows = parseVcfToRows(buffer ? buffer.toString('utf8') : '');
    } else {
      const workbook = xlsx.read(buffer || req.file.path, { type: buffer ? 'buffer' : 'file' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
    }

    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: 'File tidak memuat data kontak' });
    }

    let importedCount = 0;
    let updatedCount = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      // Dukungan Fleksibel: Format Standar, Excel Kustom, dan Format Resmi Google Contacts CSV
      // 1. Nama: Prioritaskan Name, lalu Given Name + Family Name (Google Contacts)
      let rawName = row['nama'] || row['Nama'] || row['NAME'] || row['name'] || row['kontak'] || row['Kontak'] || row['Name'] || '';
      if (!rawName && (row['Given Name'] || row['Family Name'])) {
        rawName = `${row['Given Name'] || ''} ${row['Family Name'] || ''}`.trim();
      }
      if (!rawName && (row['First Name'] || row['Middle Name'] || row['Last Name'])) {
        rawName = `${row['First Name'] || ''} ${row['Middle Name'] || ''} ${row['Last Name'] || ''}`.trim();
      }

      // 2. Nomor WhatsApp: Prioritaskan Phone 1 - Value (Google Contacts), nomor_wa, phone, dll.
      let rawNumber = row['Phone 1 - Value'] || row['Phone 2 - Value'] || row['Phone 1'] || 
                        row['nomor_wa'] || row['nomor'] || row['wa'] || row['no_hp'] || 
                        row['phone'] || row['Phone'] || row['WA'] || row['No WA'] || row['Mobile'] || '';

      // 3. Instansi / OPD: Prioritaskan Organization 1 - Name (Google Contacts), instansi, opd, skpd
      let rawSkpd = row['Organization 1 - Name'] || row['Organization Name'] || row['Department'] || row['Organization 1 - Department'] ||
                    row['Organization Department'] || row['Organization Title'] ||
                    row['instansi'] || row['Instansi'] || row['opd'] || row['OPD'] || row['skpd'] || row['SKPD'] || '';

      if (!rawNumber) {
        errors.push(`Baris ${i + 2}: Nomor WhatsApp kosong`);
        continue;
      }

      // Bersihkan nomor WhatsApp (ganti 08xxx -> 628xxx)
      let cleanNum = String(rawNumber).replace(/\D/g, '');
      if (cleanNum.startsWith('0')) {
        cleanNum = '62' + cleanNum.substring(1);
      } else if (cleanNum.startsWith('8')) {
        cleanNum = '62' + cleanNum;
      }

      if (cleanNum.length < 10) {
        errors.push(`Baris ${i + 2}: Format nomor WA '${rawNumber}' tidak valid`);
        continue;
      }

      const officialName = rawName ? String(rawName).trim() : cleanNum;
      const officialSkpd = rawSkpd ? String(rawSkpd).trim() : null;

      // Upsert ke Customer dengan flag is_imported_contact = true
      const existing = await prisma.customer.findUnique({ where: { wa_number: cleanNum } });
      if (existing) {
        await prisma.customer.update({
          where: { id: existing.id },
          data: {
            name: officialName,
            skpd_name: officialSkpd || existing.skpd_name,
            is_imported_contact: true, // Prioritas Utama
            is_custom_name: true
          }
        });
        updatedCount++;
      } else {
        await prisma.customer.create({
          data: {
            wa_number: cleanNum,
            name: officialName,
            skpd_name: officialSkpd,
            is_imported_contact: true, // Prioritas Utama
            is_custom_name: true
          }
        });
        importedCount++;
      }
    }

    res.json({
      success: true,
      message: `Berhasil mengimpor kontak master data: ${importedCount} kontak baru, ${updatedCount} kontak diperbarui.`,
      stats: {
        totalRows: rows.length,
        importedCount,
        updatedCount,
        errorCount: errors.length,
        errors: errors.slice(0, 10)
      }
    });
  } catch (error) {
    console.error('[Admin API] Error importing contacts:', error);
    res.status(500).json({ error: error.message || 'Gagal memproses file import kontak' });
  }
};


module.exports = {

  getUsers,
  createUser,
  deleteUser,
  updateUser,
  getCategoryContacts,
  addCategoryContact,
  deleteCategoryContact,
  updateCategoryContact,
  importCustomerContacts,
  clearAllCustomerContacts
};

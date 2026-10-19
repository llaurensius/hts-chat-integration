const prisma = require('../config/db');
const bcrypt = require('bcryptjs');
const { emitGlobalStaff } = require('../utils/socketEmitter');

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
      }
      await tx.customer.deleteMany();
    });

    if (req.io) {
      emitGlobalStaff(req.io, 'customer_updated', { customerId: 'all' });
      emitGlobalStaff(req.io, 'ticket_closed', { ticketId: 'all' });
    }

    res.json({
      success: true,
      message: 'Seluruh data master kontak pelanggan berhasil dihapus bersih.'
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

// Parser CSV mandiri dan aman tanpa library pihak ketiga (SEC-010)
const parseCsvToRows = (text) => {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  const firstLine = lines[0];
  const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';

  const parseLine = (line) => {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    fields.push(current.trim());
    return fields;
  };

  const headers = parseLine(lines[0]).map(h => h.replace(/^["']|["']$/g, '').trim());
  const rows = [];
  const maxRows = Math.min(lines.length, 5001); // Batas aman 5000 baris

  for (let i = 1; i < maxRows; i++) {
    const values = parseLine(lines[i]);
    const row = Object.create(null);
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j];
      if (key && key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
        let val = values[j] !== undefined ? values[j].replace(/^["']|["']$/g, '').trim() : '';
        if (val.startsWith('=') || val.startsWith('+') || val.startsWith('-') || val.startsWith('@')) {
          val = val.replace(/^[=+\-@]+/, '');
        }
        row[key] = val;
      }
    }
    rows.push(row);
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
    const isCsv = originalName.endsWith('.csv');

    let rows;
    if (isVcf) {
      rows = parseVcfToRows(buffer ? buffer.toString('utf8') : '');
    } else if (isCsv) {
      rows = parseCsvToRows(buffer ? buffer.toString('utf8') : '');
    } else {
      // SEC-013: Validasi magic bytes biner untuk file Excel (.xlsx = ZIP PK\x03\x04, .xls = OLE2 \xd0\xcf\x11\xe0)
      if (buffer && buffer.length >= 4) {
        const magicHex = buffer.subarray(0, 4).toString('hex').toLowerCase();
        const isZip = magicHex === '504b0304';
        const isOle = magicHex === 'd0cf11e0';
        if (!isZip && !isOle) {
          return res.status(400).json({ error: 'Format berkas Excel tidak valid atau rusak (header tidak cocok).' });
        }
      }

      // Sandbox & Hardening SheetJS (SEC-010): nonaktifkan formula & HTML parsing untuk mencegah ReDoS & Prototype Pollution
      const workbook = xlsx.read(buffer || req.file.path, {
        type: buffer ? 'buffer' : 'file',
        cellFormula: false,
        cellHTML: false,
        cellText: true,
        sheetRows: 5000
      });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
      rows = (rawRows || []).slice(0, 5000).map(r => {
        const clean = Object.create(null);
        for (const [k, v] of Object.entries(r)) {
          const cleanK = String(k).trim();
          if (cleanK !== '__proto__' && cleanK !== 'constructor' && cleanK !== 'prototype') {
            let cleanV = typeof v === 'string' ? v.trim() : String(v ?? '');
            if (cleanV.startsWith('=') || cleanV.startsWith('+') || cleanV.startsWith('-') || cleanV.startsWith('@')) {
              cleanV = cleanV.replace(/^[=+\-@]+/, '');
            }
            clean[cleanK] = cleanV;
          }
        }
        return clean;
      });
    }

    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: 'File tidak memuat data kontak' });
    }

    let importedCount = 0;
    let updatedCount = 0;
    const errors = [];

    // Normalisasi dan deduplikasi in-memory terlebih dahulu untuk mencegah N+1 bottleneck (DB-010)
    const validContactsMap = new Map();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      let rawName = row['nama'] || row['Nama'] || row['NAME'] || row['name'] || row['kontak'] || row['Kontak'] || row['Name'] || '';
      if (!rawName && (row['Given Name'] || row['Family Name'])) {
        rawName = `${row['Given Name'] || ''} ${row['Family Name'] || ''}`.trim();
      }
      if (!rawName && (row['First Name'] || row['Middle Name'] || row['Last Name'])) {
        rawName = `${row['First Name'] || ''} ${row['Middle Name'] || ''} ${row['Last Name'] || ''}`.trim();
      }

      let rawNumber = row['Phone 1 - Value'] || row['Phone 2 - Value'] || row['Phone 1'] || 
                        row['nomor_wa'] || row['nomor'] || row['wa'] || row['no_hp'] || 
                        row['phone'] || row['Phone'] || row['WA'] || row['No WA'] || row['Mobile'] || '';

      let rawSkpd = row['Organization 1 - Name'] || row['Organization Name'] || row['Department'] || row['Organization 1 - Department'] ||
                    row['Organization Department'] || row['Organization Title'] ||
                    row['instansi'] || row['Instansi'] || row['opd'] || row['OPD'] || row['skpd'] || row['SKPD'] || '';

      if (!rawNumber) {
        errors.push(`Baris ${i + 2}: Nomor WhatsApp kosong`);
        continue;
      }

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

      validContactsMap.set(cleanNum, {
        wa_number: cleanNum,
        name: officialName,
        skpd_name: officialSkpd
      });
    }

    const uniqueContacts = Array.from(validContactsMap.values());
    const BATCH_SIZE = 100;

    // Proses batch upsert untuk performa optimal (DB-010)
    for (let i = 0; i < uniqueContacts.length; i += BATCH_SIZE) {
      const batch = uniqueContacts.slice(i, i + BATCH_SIZE);
      const batchNumbers = batch.map(c => c.wa_number);

      const existingCustomers = await prisma.customer.findMany({
        where: { wa_number: { in: batchNumbers } },
        select: { id: true, wa_number: true, skpd_name: true }
      });
      const existingMap = new Map(existingCustomers.map(c => [c.wa_number, c]));

      await prisma.$transaction(
        batch.map(contact => {
          const existing = existingMap.get(contact.wa_number);
          if (existing) {
            updatedCount++;
            return prisma.customer.update({
              where: { wa_number: contact.wa_number },
              data: {
                name: contact.name,
                skpd_name: contact.skpd_name || existing.skpd_name,
                is_imported_contact: true,
                is_custom_name: true
              }
            });
          } else {
            importedCount++;
            return prisma.customer.create({
              data: {
                wa_number: contact.wa_number,
                name: contact.name,
                skpd_name: contact.skpd_name,
                is_imported_contact: true,
                is_custom_name: true
              }
            });
          }
        })
      );
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

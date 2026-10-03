const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/adminController');
const multer = require('multer');
const uploadDoc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // Maksimal 15MB
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.xlsx', '.xls', '.csv', '.vcf', '.vcard'];
    const ext = require('path').extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Format berkas tidak didukung. Unggah berkas Excel (.xlsx/.xls), CSV, atau VCF.'));
    }
  }
});

router.get('/users', getUsers);
router.post('/users', createUser);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

// Rute Manajemen Multi-Kontak WhatsApp Blast per Tim L2
router.get('/categories/contacts', getCategoryContacts);
router.post('/categories/:categoryId/contacts', addCategoryContact);
router.put('/categories/contacts/:contactId', updateCategoryContact);
router.delete('/categories/contacts/:contactId', deleteCategoryContact);

// Rute Import Master Data Kontak Pelanggan (Admin Only)
router.post('/contacts/import', uploadDoc.single('file'), importCustomerContacts);
router.delete('/contacts/clear-all', clearAllCustomerContacts);

module.exports = router;

const express = require('express');
const router = express.Router();
const {
  getUsers,
  createUser,
  deleteUser,
  getCategoryContacts,
  addCategoryContact,
  deleteCategoryContact
} = require('../controllers/adminController');

router.get('/users', getUsers);
router.post('/users', createUser);
router.delete('/users/:id', deleteUser);

// Rute Manajemen Multi-Kontak WhatsApp Blast per Tim L2
router.get('/categories/contacts', getCategoryContacts);
router.post('/categories/:categoryId/contacts', addCategoryContact);
router.delete('/categories/contacts/:contactId', deleteCategoryContact);

module.exports = router;

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
  updateCategoryContact
} = require('../controllers/adminController');

router.get('/users', getUsers);
router.post('/users', createUser);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

// Rute Manajemen Multi-Kontak WhatsApp Blast per Tim L2
router.get('/categories/contacts', getCategoryContacts);
router.post('/categories/:categoryId/contacts', addCategoryContact);
router.put('/categories/contacts/:contactId', updateCategoryContact);
router.delete('/categories/contacts/:contactId', deleteCategoryContact);

module.exports = router;

const fs = require('fs');
let code = fs.readFileSync('backend/src/controllers/authController.js', 'utf8');

code = code.replace(
  'res.json(user);',
  'res.json({ id: user.id, name: user.name, email: user.email, role: user.role, category: user.category ? user.category.name : null });'
);

fs.writeFileSync('backend/src/controllers/authController.js', code);

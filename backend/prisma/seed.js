const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('--- Starting Database Seeding V2.1 (3 L2 Teams) ---');

  // Hapus semua data relasi tiket-kategori untuk mencegah error foreign key
  await prisma.ticketCategory.deleteMany();
  
  // Update pengguna yang ada agar tidak merujuk ke kategori lama
  await prisma.user.updateMany({
    data: { category_id: null }
  });

  // Hapus kategori lama
  await prisma.category.deleteMany();

  // 1. Seed Categories (3 Tim Utama L2)
  const categoriesData = [
    { name: 'Network', wa_target_number: '628000000001' },
    { name: 'Server', wa_target_number: '628000000002' },
    { name: 'Mechanical & Electrical (M&E)', wa_target_number: '628000000003' }
  ];
  
  const categoryMap = {};

  for (const cat of categoriesData) {
    const category = await prisma.category.create({ data: cat });
    console.log(`[Category Created] ${category.name}`);
    categoryMap[category.name] = category.id;
  }

  // 2. Hash default password
  const hashedPassword = await bcrypt.hash('password123', 10);

  // 3. Seed Users (Admin, L1 Dispatcher & L2 Technicians)
  const users = [
    {
      name: 'Administrator',
      email: 'admin@helpdesk.go.id',
      password: hashedPassword,
      role: 'ADMIN',
      category_id: null,
    },
    {
      name: 'Supervisor',
      email: 'spv@helpdesk.go.id',
      password: hashedPassword,
      role: 'SPV',
      category_id: null,
    },
    {
      name: 'Dispatcher L1',
      email: 'l1@helpdesk.go.id',
      password: hashedPassword,
      role: 'L1',
      category_id: null,
    },
    {
      name: 'Teknisi Network L2',
      email: 'l2_network@helpdesk.go.id',
      password: hashedPassword,
      role: 'L2',
      category_id: categoryMap['Network'],
    },
    {
      name: 'Teknisi Server L2',
      email: 'l2_server@helpdesk.go.id',
      password: hashedPassword,
      role: 'L2',
      category_id: categoryMap['Server'],
    },
    {
      name: 'Teknisi M&E L2',
      email: 'l2_me@helpdesk.go.id',
      password: hashedPassword,
      role: 'L2',
      category_id: categoryMap['Mechanical & Electrical (M&E)'],
    }
  ];

  for (const u of users) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (!existing) {
      const created = await prisma.user.create({ data: u });
      console.log(`[User Created] ${created.email} (${created.role})`);
    } else {
      const updated = await prisma.user.update({
        where: { email: u.email },
        data: { category_id: u.category_id, name: u.name }
      });
      console.log(`[User Updated] ${updated.email} (${updated.role})`);
    }
  }

  console.log('--- Database Seeding V2.1 Completed Successfully ---');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

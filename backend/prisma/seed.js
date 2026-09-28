const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('--- Starting Database Seeding V2 ---');

  // 1. Seed Categories (sebelumnya Divisions)
  const categoriesData = [
    { name: 'Troubleshooting - Server', wa_target_number: '628000000001' },
    { name: 'Troubleshooting - Network', wa_target_number: '628000000002' },
    { name: 'Troubleshooting - Aplikasi', wa_target_number: '628000000003' },
    { name: 'Troubleshooting - M&E', wa_target_number: '628000000004' },
    { name: 'Request Layanan', wa_target_number: '628000000005' },
    { name: 'Monitoring', wa_target_number: '628000000006' }
  ];
  
  const categoryMap = {};

  for (const cat of categoriesData) {
    let category = await prisma.category.findFirst({ where: { name: cat.name } });
    if (!category) {
      category = await prisma.category.create({ data: cat });
      console.log(`[Category Created] ${category.name}`);
    } else {
      console.log(`[Category Exists] ${category.name}`);
    }
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
      name: 'Teknisi Server L2',
      email: 'l2_server@helpdesk.go.id',
      password: hashedPassword,
      role: 'L2',
      category_id: categoryMap['Troubleshooting - Server'],
    },
    {
      name: 'Teknisi Network L2',
      email: 'l2_network@helpdesk.go.id',
      password: hashedPassword,
      role: 'L2',
      category_id: categoryMap['Troubleshooting - Network'],
    }
  ];

  for (const u of users) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (!existing) {
      const created = await prisma.user.create({ data: u });
      console.log(`[User Created] ${created.email} (${created.role})`);
    } else {
      console.log(`[User Exists] ${existing.email}`);
    }
  }

  console.log('--- Database Seeding V2 Completed Successfully ---');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


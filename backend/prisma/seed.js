const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('--- Starting Database Seeding ---');

  // 1. Seed Divisions
  const divisionNames = ['Server', 'Network', 'Aplikasi', 'Data Center'];
  const divisionMap = {};

  for (const name of divisionNames) {
    let div = await prisma.division.findFirst({ where: { name } });
    if (!div) {
      div = await prisma.division.create({ data: { name } });
      console.log(`[Division Created] ${name} (ID: ${div.id})`);
    } else {
      console.log(`[Division Exists] ${name} (ID: ${div.id})`);
    }
    divisionMap[name] = div.id;
  }

  // 2. Hash default password
  const hashedPassword = await bcrypt.hash('password123', 10);

  // 3. Seed Users
  const users = [
    {
      name: 'Supervisor DC',
      email: 'spv@helpdesk.go.id',
      password: hashedPassword,
      role: 'SPV',
      division_id: null,
    },
    {
      name: 'Dispatcher L1',
      email: 'l1@helpdesk.go.id',
      password: hashedPassword,
      role: 'L1',
      division_id: null,
    },
    {
      name: 'Teknisi Server L2',
      email: 'l2_server@helpdesk.go.id',
      password: hashedPassword,
      role: 'L2',
      division_id: divisionMap['Server'],
    },
    {
      name: 'Teknisi Network L2',
      email: 'l2_network@helpdesk.go.id',
      password: hashedPassword,
      role: 'L2',
      division_id: divisionMap['Network'],
    },
    {
      name: 'Teknisi Aplikasi L2',
      email: 'l2_aplikasi@helpdesk.go.id',
      password: hashedPassword,
      role: 'L2',
      division_id: divisionMap['Aplikasi'],
    },
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

  console.log('--- Database Seeding Completed Successfully ---');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


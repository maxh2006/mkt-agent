import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import bcrypt from 'bcryptjs';

const db = new PrismaClient();

async function seed() {
  const hash = await bcrypt.hash('admin123', 10);

  const user = await db.user.upsert({
    where: { email: 'admin@mkt.local' },
    update: {},
    create: {
      name: 'Admin User',
      email: 'admin@mkt.local',
      password_hash: hash,
      role: 'admin',
      active: true,
    },
  });

  const brand = await db.brand.upsert({
    where: { id: 'brand_test_01' },
    update: {},
    create: {
      id: 'brand_test_01',
      name: 'Test Brand',
      primary_color: '#6366F1',
      domain: 'testbrand.com',
      active: true,
      settings_json: {},
    },
  });

  console.log('✓ User:', user.email);
  console.log('✓ Brand:', brand.name);
  await db.$disconnect();
}

seed().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});

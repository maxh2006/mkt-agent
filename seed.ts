import "dotenv/config";
import { PrismaClient } from "./src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

async function seed() {
  const hash = await bcrypt.hash("admin123", 10);

  const user = await db.user.upsert({
    where: { email: "admin@mkt.local" },
    update: {},
    create: {
      name: "Admin User",
      email: "admin@mkt.local",
      password_hash: hash,
      role: "admin",
      active: true,
    },
  });

  const brand = await db.brand.upsert({
    where: { id: "brand_test_01" },
    update: {},
    create: {
      id: "brand_test_01",
      name: "Test Brand",
      primary_color: "#6366F1",
      domain: "testbrand.com",
      active: true,
      settings_json: {},
    },
  });

  console.log("✓ User:", user.email, "/ password: admin123");
  console.log("✓ Brand:", brand.name);
  await db.$disconnect();
}

seed().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});

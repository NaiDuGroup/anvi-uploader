/**
 * Upserts deterministic users for integration / E2E tests.
 * Does not delete orders or other data.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";

const prisma = new PrismaClient();

const TEST_USERS = [
  { name: "e2e-admin@anvi.test", role: "admin" as const },
  { name: "e2e-workshop@anvi.test", role: "workshop" as const },
];

const TEST_PASSWORD = "testpass123";

async function main() {
  const hashed = hashPassword(TEST_PASSWORD);

  for (const { name, role } of TEST_USERS) {
    const existing = await prisma.user.findFirst({ where: { name } });
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role, password: hashed },
      });
    } else {
      await prisma.user.create({ data: { name, role, password: hashed } });
    }
    console.log(`Upserted ${role}: ${name}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

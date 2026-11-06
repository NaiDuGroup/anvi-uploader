/**
 * Upserts deterministic users for integration / E2E tests.
 * Does not delete orders or other data.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";
import { normalizedPhoneForDb } from "../src/lib/studioClient";

const prisma = new PrismaClient();

const TEST_USERS = [
  { name: "e2e-admin@anvi.test", role: "admin" as const },
  { name: "e2e-workshop@anvi.test", role: "workshop" as const },
  { name: "e2e-superadmin@anvi.test", role: "superadmin" as const },
];

const TEST_PASSWORD = "testpass123";

/** Cabinet (customer portal) logins: phone + TEST_PASSWORD. Local / test DBs only. */
const TEST_CUSTOMERS = [
  { phone: "+37369000101", personName: "E2E Retail Client", isDealer: false },
  { phone: "+37369000102", personName: "E2E Dealer", isDealer: true },
];

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

  for (const c of TEST_CUSTOMERS) {
    const phoneNormalized = normalizedPhoneForDb(c.phone)!;
    const existing = await prisma.user.findUnique({ where: { phoneNormalized } });
    if (existing?.studioCustomerId) {
      await prisma.studioCustomer.update({
        where: { id: existing.studioCustomerId },
        data: { isDealer: c.isDealer, personName: c.personName },
      });
      await prisma.user.update({ where: { id: existing.id }, data: { password: hashed } });
    } else {
      const sc = await prisma.studioCustomer.create({
        data: { kind: "INDIVIDUAL", phone: c.phone, phoneNormalized, personName: c.personName, isDealer: c.isDealer },
      });
      await prisma.user.create({
        data: {
          name: c.personName,
          displayName: c.personName,
          role: "customer",
          password: hashed,
          phoneNormalized,
          studioCustomerId: sc.id,
        },
      });
    }
    console.log(`Upserted customer${c.isDealer ? " (dealer)" : ""}: ${c.phone}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

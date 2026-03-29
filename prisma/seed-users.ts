import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "crypto";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const USERS = [
  { name: "anatolie@anvi.md", role: "admin" },
  { name: "elvira@anvi.md", role: "admin" },
  { name: "vera@anvi.md", role: "admin" },
  { name: "angelina@anvi.md", role: "admin" },
  { name: "victoria@anvi.md", role: "admin" },
  { name: "ecaterina@anvi.md", role: "admin" },
  { name: "daria@anvi.md", role: "admin" },
  { name: "vitalie@anvi.md", role: "workshop" },
] as const;

const DEFAULT_PASSWORD = "anvi";

async function main() {
  const hashed = hashPassword(DEFAULT_PASSWORD);

  for (const { name, role } of USERS) {
    const existing = await prisma.user.findFirst({ where: { name } });

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role, password: hashed },
      });
      console.log(`Updated ${role}: ${name}`);
    } else {
      await prisma.user.create({
        data: { name, role, password: hashed },
      });
      console.log(`Created ${role}: ${name}`);
    }
  }

  console.log(`\nDone. ${USERS.length} users upserted. Password: ${DEFAULT_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

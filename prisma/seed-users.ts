import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "crypto";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const USERS = [
  { name: "anatolie@anvi.md", displayName: "Anatolie", role: "superadmin" },
  { name: "elvira@anvi.md", displayName: "Elvira", role: "admin" },
  { name: "vera@anvi.md", displayName: "Vera", role: "admin" },
  { name: "angelina@anvi.md", displayName: "Angelina", role: "admin" },
  { name: "victoria@anvi.md", displayName: "Victoria", role: "admin" },
  { name: "ecaterina@anvi.md", displayName: "Ecaterina", role: "admin" },
  { name: "daria@anvi.md", displayName: "Daria", role: "admin" },
  { name: "vitalie@anvi.md", displayName: "Vitalie", role: "workshop" },
] as const;

const DEFAULT_PASSWORD = "anvi";

async function main() {
  const hashed = hashPassword(DEFAULT_PASSWORD);

  for (const { name, displayName, role } of USERS) {
    const existing = await prisma.user.findFirst({ where: { name } });

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { displayName, role, password: hashed },
      });
      console.log(`Updated ${role}: ${name} / ${displayName}`);
    } else {
      await prisma.user.create({
        data: { name, displayName, role, password: hashed },
      });
      console.log(`Created ${role}: ${name} / ${displayName}`);
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

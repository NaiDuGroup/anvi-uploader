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
  // Clean existing data
  console.log("Cleaning database...");
  await prisma.commentRead.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.session.deleteMany();
  await prisma.file.deleteMany();
  await prisma.order.deleteMany();
  await prisma.user.deleteMany();
  console.log("Database cleaned.");

  const hashed = hashPassword(DEFAULT_PASSWORD);

  for (const { name, role } of USERS) {
    await prisma.user.create({
      data: { name, role, password: hashed },
    });
    console.log(`Created ${role}: ${name}`);
  }

  console.log(`\nAll ${USERS.length} users created. Password for all: ${DEFAULT_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

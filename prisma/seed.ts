import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "crypto";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const USERS = [
  { name: "admin", role: "admin", password: "admin123" },
  { name: "workshop", role: "workshop", password: "workshop123" },
  { name: "anatolie@anvi.md", role: "admin", password: "anvi" },
  { name: "elvira@anvi.md", role: "admin", password: "anvi" },
  { name: "vera@anvi.md", role: "admin", password: "anvi" },
  { name: "angelina@anvi.md", role: "admin", password: "anvi" },
  { name: "victoria@anvi.md", role: "admin", password: "anvi" },
  { name: "ecaterina@anvi.md", role: "admin", password: "anvi" },
  { name: "daria@anvi.md", role: "admin", password: "anvi" },
  { name: "vitalie@anvi.md", role: "workshop", password: "anvi" },
] as const;

async function main() {
  console.log("Cleaning database...");
  await prisma.orderLog.deleteMany();
  await prisma.commentRead.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.session.deleteMany();
  await prisma.file.deleteMany();
  await prisma.order.deleteMany();
  await prisma.user.deleteMany();
  console.log("Database cleaned.");

  for (const { name, role, password } of USERS) {
    await prisma.user.create({
      data: { name, role, password: hashPassword(password) },
    });
    console.log(`Created user: ${name} (${role})`);
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

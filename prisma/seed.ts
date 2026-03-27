import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "crypto";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

async function main() {
  const existing = await prisma.user.findFirst({ where: { name: "admin" } });
  if (existing) {
    console.log("Admin user already exists, skipping seed.");
    return;
  }

  await prisma.user.create({
    data: {
      name: "admin",
      role: "admin",
      password: hashPassword("admin123"),
    },
  });

  console.log("Created admin user: name=admin, password=admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "crypto";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

async function main() {
  const existingAdmin = await prisma.user.findFirst({
    where: { name: "admin" },
  });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        name: "admin",
        role: "admin",
        password: hashPassword("admin123"),
      },
    });
    console.log("Created studio admin: name=admin, password=admin123");
  } else {
    console.log("Studio admin already exists, skipping.");
  }

  const existingWorkshop = await prisma.user.findFirst({
    where: { name: "workshop" },
  });
  if (!existingWorkshop) {
    await prisma.user.create({
      data: {
        name: "workshop",
        role: "workshop",
        password: hashPassword("workshop123"),
      },
    });
    console.log("Created workshop user: name=workshop, password=workshop123");
  } else {
    console.log("Workshop user already exists, skipping.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

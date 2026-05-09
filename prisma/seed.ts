import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "crypto";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const USERS = [
  { name: "admin", displayName: "Admin", role: "admin", password: "admin123" },
  { name: "workshop", displayName: "Workshop", role: "workshop", password: "workshop123" },
  { name: "anatolie@anvi.md", displayName: "Anatolie", role: "superadmin", password: "anvi" },
  { name: "elvira@anvi.md", displayName: "Elvira", role: "admin", password: "anvi" },
  { name: "vera@anvi.md", displayName: "Vera", role: "admin", password: "anvi" },
  { name: "angelina@anvi.md", displayName: "Angelina", role: "admin", password: "anvi" },
  { name: "victoria@anvi.md", displayName: "Victoria", role: "admin", password: "anvi" },
  { name: "ecaterina@anvi.md", displayName: "Ecaterina", role: "admin", password: "anvi" },
  { name: "daria@anvi.md", displayName: "Daria", role: "admin", password: "anvi" },
  { name: "vitalie@anvi.md", displayName: "Vitalie", role: "workshop", password: "anvi" },
] as const;

async function main() {
  // Safety: this script wipes orders/users/files. Refuse to run against
  // production unless the operator explicitly opts in.
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_DESTRUCTIVE_SEED !== "YES"
  ) {
    throw new Error(
      "Refusing to run destructive seed in production. Set ALLOW_DESTRUCTIVE_SEED=YES to override.",
    );
  }
  const url = process.env.DATABASE_URL ?? "";
  if (
    process.env.ALLOW_DESTRUCTIVE_SEED !== "YES" &&
    !/localhost|127\.0\.0\.1/.test(url)
  ) {
    throw new Error(
      `Refusing to run destructive seed against non-local DATABASE_URL (${url.replace(/:[^:@/]+@/, ":***@")}). Set ALLOW_DESTRUCTIVE_SEED=YES to override.`,
    );
  }

  console.log("Cleaning database...");
  await prisma.orderLog.deleteMany();
  await prisma.commentRead.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.session.deleteMany();
  await prisma.file.deleteMany();
  await prisma.order.deleteMany();
  await prisma.mugProduct.deleteMany();
  await prisma.user.deleteMany();
  console.log("Database cleaned.");

  for (const { name, displayName, role, password } of USERS) {
    await prisma.user.create({
      data: { name, displayName, role, password: hashPassword(password) },
    });
    console.log(`Created user: ${name} / ${displayName} (${role})`);
  }

  await prisma.mugProduct.create({
    data: {
      sku: "STANDARD-WHITE",
      nameRo: "Cană albă clasică",
      nameRu: "Классическая белая кружка",
      nameEn: "Classic white mug",
      stockQuantity: 0,
      sellPrice: null,
      dealerPrice: null,
      bodyColorHex: "#f5f5f0",
      handleColorHex: "#a8a29e",
      isActive: true,
      sortOrder: 0,
      internalNotes: "Exemplu SKU; clienții pot alege «Altceva» dacă nu găsesc modelul.",
    },
  });
  console.log("Created sample MugProduct.");

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

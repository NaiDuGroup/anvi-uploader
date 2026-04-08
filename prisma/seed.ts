import { PrismaClient, Prisma } from "@prisma/client";
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

const COPIES_ATTRIBUTE_SCHEMA = {
  fields: [
    {
      key: "copies",
      label: { ro: "Cantitate", ru: "Количество", en: "Quantity" },
      type: "number",
      required: true,
      min: 1,
      defaultValue: 1,
    },
  ],
} as const;

const FOTO_SETS_ATTRIBUTE_SCHEMA = {
  fields: [
    {
      key: "copies",
      label: {
        ro: "Cantitate seturi",
        ru: "Количество комплектов",
        en: "Number of sets",
      },
      type: "number",
      required: true,
      min: 1,
      defaultValue: 1,
    },
  ],
} as const;

const BC_COPIES_ATTRIBUTE_SCHEMA = {
  fields: [
    {
      key: "copies",
      label: { ro: "Cantitate", ru: "Количество", en: "Quantity" },
      type: "number",
      required: true,
      min: 1,
      defaultValue: 100,
    },
  ],
} as const;

const MUG_ATTRIBUTE_SCHEMA = {
  fields: [
    {
      key: "printType",
      label: { ro: "Tip printare", ru: "Тип печати", en: "Print type" },
      type: "select",
      required: true,
      options: [
        { value: "sublimation", label: { ro: "Sublimare", ru: "Сублимация", en: "Sublimation" } },
        { value: "uv", label: { ro: "UV", ru: "UV", en: "UV" } },
      ],
    },
    {
      key: "copies",
      label: { ro: "Cantitate", ru: "Количество", en: "Quantity" },
      type: "number",
      required: true,
      min: 1,
      defaultValue: 1,
    },
  ],
} as const;

const TEXTILE_ATTRIBUTE_SCHEMA = {
  fields: [
    {
      key: "itemType",
      label: { ro: "Articol", ru: "Изделие", en: "Item type" },
      type: "select",
      required: true,
      options: [
        { value: "tshirt", label: { ro: "Tricou", ru: "Футболка", en: "T-shirt" } },
        { value: "hoodie", label: { ro: "Hanorac", ru: "Худи", en: "Hoodie" } },
        { value: "cap", label: { ro: "Șapcă", ru: "Кепка", en: "Cap" } },
        { value: "other", label: { ro: "Altele", ru: "Другое", en: "Other" } },
      ],
    },
    {
      key: "size",
      label: { ro: "Mărime", ru: "Размер", en: "Size" },
      type: "select",
      required: true,
      options: ["XS", "S", "M", "L", "XL", "XXL"].map((value) => ({
        value,
        label: { ro: value, ru: value, en: value },
      })),
    },
    {
      key: "printType",
      label: { ro: "Tip printare", ru: "Тип печати", en: "Print type" },
      type: "select",
      required: true,
      options: [
        { value: "dtf", label: { ro: "DTF", ru: "DTF", en: "DTF" } },
        { value: "sublimation", label: { ro: "Sublimare", ru: "Сублимация", en: "Sublimation" } },
        { value: "screen", label: { ro: "Serigrafie", ru: "Шелкография", en: "Screen print" } },
      ],
    },
    {
      key: "copies",
      label: { ro: "Cantitate", ru: "Количество", en: "Quantity" },
      type: "number",
      required: true,
      min: 1,
      defaultValue: 1,
    },
  ],
} as const;

const SOUVENIR_ATTRIBUTE_SCHEMA = {
  fields: [
    {
      key: "printType",
      label: { ro: "Tip printare", ru: "Тип обработки", en: "Print / finish type" },
      type: "select",
      required: true,
      options: [
        { value: "sublimation", label: { ro: "Sublimare", ru: "Сублимация", en: "Sublimation" } },
        { value: "uv", label: { ro: "UV", ru: "UV", en: "UV" } },
        { value: "engraving", label: { ro: "Gravare", ru: "Гравировка", en: "Engraving" } },
      ],
    },
    {
      key: "copies",
      label: { ro: "Cantitate", ru: "Количество", en: "Quantity" },
      type: "number",
      required: true,
      min: 1,
      defaultValue: 1,
    },
  ],
} as const;

const BANNER_ATTRIBUTE_SCHEMA = {
  fields: [
    {
      key: "material",
      label: { ro: "Material", ru: "Материал", en: "Material" },
      type: "select",
      required: true,
      options: [
        { value: "vinyl", label: { ro: "Vinil", ru: "Винил", en: "Vinyl" } },
        { value: "mesh", label: { ro: "Mesh", ru: "Сетка", en: "Mesh" } },
        { value: "backlit", label: { ro: "Backlit", ru: "Бэклит", en: "Backlit" } },
      ],
    },
    { key: "width", label: { ro: "Lățime (m)", ru: "Ширина (м)", en: "Width (m)" }, type: "number", required: true, min: 0.01 },
    { key: "height", label: { ro: "Înălțime (m)", ru: "Высота (м)", en: "Height (m)" }, type: "number", required: true, min: 0.01 },
    {
      key: "eyelets",
      label: { ro: "Ocheți", ru: "Люверсы", en: "Eyelets" },
      type: "boolean",
      required: false,
      defaultValue: true,
    },
    {
      key: "copies",
      label: { ro: "Cantitate", ru: "Количество", en: "Quantity" },
      type: "number",
      required: true,
      min: 1,
      defaultValue: 1,
    },
  ],
} as const;

const LARGE_FORMAT_ATTRIBUTE_SCHEMA = {
  fields: [
    {
      key: "material",
      label: { ro: "Material", ru: "Материал", en: "Material" },
      type: "select",
      required: true,
      options: [
        { value: "dibond", label: { ro: "Dibond", ru: "Дибонд", en: "Dibond" } },
        { value: "pvc", label: { ro: "PVC", ru: "ПВХ", en: "PVC" } },
        { value: "canvas", label: { ro: "Canvas", ru: "Холст", en: "Canvas" } },
        { value: "photo-paper", label: { ro: "Hârtie foto", ru: "Фотобумага", en: "Photo paper" } },
        { value: "poster", label: { ro: "Poster", ru: "Постер", en: "Poster" } },
      ],
    },
    { key: "width", label: { ro: "Lățime (m)", ru: "Ширина (м)", en: "Width (m)" }, type: "number", required: true, min: 0.01 },
    { key: "height", label: { ro: "Înălțime (m)", ru: "Высота (м)", en: "Height (m)" }, type: "number", required: true, min: 0.01 },
    {
      key: "copies",
      label: { ro: "Cantitate", ru: "Количество", en: "Quantity" },
      type: "number",
      required: true,
      min: 1,
      defaultValue: 1,
    },
  ],
} as const;

const BOOKS_ATTRIBUTE_SCHEMA = {
  fields: [
    {
      key: "bindingType",
      label: { ro: "Tip legare", ru: "Переплёт", en: "Binding type" },
      type: "select",
      required: true,
      options: [
        { value: "staple", label: { ro: "Capsat", ru: "Скоба", en: "Staple" } },
        { value: "spiral", label: { ro: "Spirală", ru: "Спираль", en: "Spiral" } },
        { value: "perfect", label: { ro: "Perfect bound", ru: "КБС", en: "Perfect bound" } },
        { value: "hardcover", label: { ro: "Copertă rigidă", ru: "Твёрдый переплёт", en: "Hardcover" } },
      ],
    },
    {
      key: "paperSize",
      label: { ro: "Format hârtie", ru: "Формат", en: "Paper size" },
      type: "select",
      required: true,
      options: [
        { value: "A4", label: { ro: "A4", ru: "A4", en: "A4" } },
        { value: "A5", label: { ro: "A5", ru: "A5", en: "A5" } },
        { value: "A6", label: { ro: "A6", ru: "A6", en: "A6" } },
      ],
    },
    {
      key: "color",
      label: { ro: "Culoare", ru: "Цветность", en: "Color" },
      type: "select",
      required: true,
      options: [
        { value: "bw", label: { ro: "Alb-negru", ru: "Ч/Б", en: "Black & white" } },
        { value: "color", label: { ro: "Color", ru: "Цвет", en: "Color" } },
      ],
    },
    {
      key: "copies",
      label: { ro: "Cantitate", ru: "Количество", en: "Quantity" },
      type: "number",
      required: true,
      min: 1,
      defaultValue: 1,
    },
  ],
} as const;

const STICKERS_ATTRIBUTE_SCHEMA = {
  fields: [
    {
      key: "material",
      label: { ro: "Material", ru: "Материал", en: "Material" },
      type: "select",
      required: true,
      options: [
        { value: "vinyl", label: { ro: "Vinil", ru: "Винил", en: "Vinyl" } },
        { value: "paper", label: { ro: "Hârtie", ru: "Бумага", en: "Paper" } },
        { value: "transparent", label: { ro: "Transparent", ru: "Прозрачный", en: "Transparent" } },
      ],
    },
    {
      key: "shape",
      label: { ro: "Formă", ru: "Форма", en: "Shape" },
      type: "select",
      required: true,
      options: [
        { value: "rectangle", label: { ro: "Dreptunghi", ru: "Прямоугольник", en: "Rectangle" } },
        { value: "circle", label: { ro: "Cerc", ru: "Круг", en: "Circle" } },
        { value: "custom", label: { ro: "Personalizat", ru: "Своя форма", en: "Custom" } },
      ],
    },
    {
      key: "copies",
      label: { ro: "Cantitate", ru: "Количество", en: "Quantity" },
      type: "number",
      required: true,
      min: 1,
      defaultValue: 1,
    },
  ],
} as const;

const BROSURARE_ATTRIBUTE_SCHEMA = {
  fields: [
    {
      key: "bindType",
      label: { ro: "Tip inele", ru: "Тип пружины", en: "Spine type" },
      type: "select",
      required: true,
      defaultValue: "plastic",
      options: [
        { value: "plastic", label: { ro: "Plastic", ru: "Пластик", en: "Plastic" } },
        { value: "metal", label: { ro: "Metal", ru: "Металл", en: "Metal" } },
      ],
    },
    {
      key: "copies",
      label: { ro: "Cantitate", ru: "Количество", en: "Quantity" },
      type: "number",
      required: true,
      min: 1,
      defaultValue: 1,
    },
  ],
} as const;

const LAMINARE_ATTRIBUTE_SCHEMA = {
  fields: [
    {
      key: "finish",
      label: { ro: "Finisaj", ru: "Покрытие", en: "Finish" },
      type: "select",
      required: true,
      defaultValue: "glossy",
      options: [
        { value: "glossy", label: { ro: "Lucios", ru: "Глянец", en: "Glossy" } },
        { value: "matte", label: { ro: "Mat", ru: "Матовый", en: "Matte" } },
      ],
    },
    {
      key: "copies",
      label: { ro: "Cantitate", ru: "Количество", en: "Quantity" },
      type: "number",
      required: true,
      min: 1,
      defaultValue: 1,
    },
  ],
} as const;

const FOTO_SURCHARGES = [
  {
    key: "clothes-change",
    label: { ro: "Schimbarea hainei", ru: "Смена одежды", en: "Clothes change" },
    pricePerUnit: 10,
  },
] as const;

const BC_SURCHARGES = [
  {
    key: "rounded-corners",
    label: { ro: "Colțuri rotunde", ru: "Закруглённые углы", en: "Rounded corners" },
    pricePerUnit: 0.5,
  },
] as const;

async function main() {
  console.log("Cleaning database...");
  await prisma.orderLog.deleteMany();
  await prisma.commentRead.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.session.deleteMany();
  await prisma.file.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productCategory.deleteMany();
  await prisma.user.deleteMany();
  console.log("Database cleaned.");

  for (const { name, role, password } of USERS) {
    await prisma.user.create({
      data: { name, role, password: hashPassword(password) },
    });
    console.log(`Created user: ${name} (${role})`);
  }

  const j = (v: unknown) => v as unknown as Prisma.InputJsonValue;

  // --- Categories & products ---

  const cat1 = await prisma.productCategory.create({
    data: {
      name: "Xerox",
      slug: "xerox",
      icon: "FileText",
      sortOrder: 0,
      pricingModel: "fixed",
      attributeSchema: j(COPIES_ATTRIBUTE_SCHEMA),
      surcharges: Prisma.JsonNull,
      servicePriceDefault: null,
      dimensionsRequired: false,
      hasCustomizer: false,
      customizerType: null,
      needsApproval: false,
    },
  });
  await prisma.product.createMany({
    data: [
      { categoryId: cat1.id, name: "Xerox A4 — Pe o parte", sku: "XRX-A4-1S", sellingPrice: 2, sortOrder: 0, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat1.id, name: "Xerox A4 — Duplex", sku: "XRX-A4-DPX", sellingPrice: 4, sortOrder: 1, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat1.id, name: "Xerox A3 — Pe o parte", sku: "XRX-A3-1S", sellingPrice: 4, sortOrder: 2, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat1.id, name: "Xerox A3 — Duplex", sku: "XRX-A3-DPX", sellingPrice: 8, sortOrder: 3, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat1.id, name: "Xerox Buletin", sku: "XRX-BULETIN", sellingPrice: 4, sortOrder: 4, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat1.id, name: "Xerox Carte", sku: "XRX-CARTE-DPX", description: "A4 = 4 lei, A3 = 8 lei", sellingPrice: 4, sortOrder: 5, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
    ],
  });

  const cat2 = await prisma.productCategory.create({
    data: {
      name: "Tipar Color",
      slug: "tipar-color",
      icon: "Palette",
      sortOrder: 1,
      pricingModel: "fixed",
      attributeSchema: j(COPIES_ATTRIBUTE_SCHEMA),
      surcharges: Prisma.JsonNull,
      servicePriceDefault: null,
      dimensionsRequired: false,
      hasCustomizer: false,
      customizerType: null,
      needsApproval: false,
    },
  });
  await prisma.product.createMany({
    data: [
      { categoryId: cat2.id, name: "Color A4 — 80g", sku: "CLR-A4-80G", sellingPrice: 5, sortOrder: 0, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat2.id, name: "Color A3 — 80g", sku: "CLR-A3-80G", sellingPrice: 10, sortOrder: 1, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat2.id, name: "Color A4 — 105-150g", sku: "CLR-A4-150G", sellingPrice: 10, sortOrder: 2, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat2.id, name: "Color A3 — 105-150g", sku: "CLR-A3-150G", sellingPrice: 20, sortOrder: 3, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat2.id, name: "Color A4 — 200-350g", sku: "CLR-A4-350G", sellingPrice: 12, sortOrder: 4, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat2.id, name: "Color A3 — 200-350g", sku: "CLR-A3-350G", sellingPrice: 25, sortOrder: 5, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat2.id, name: "Color A4 — Texturat", sku: "CLR-A4-TXT", sellingPrice: 18, sortOrder: 6, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat2.id, name: "Color A3 — Texturat", sku: "CLR-A3-TXT", sellingPrice: 36, sortOrder: 7, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
    ],
  });

  const cat3 = await prisma.productCategory.create({
    data: {
      name: "Сканирование",
      slug: "scanare",
      icon: "ScanLine",
      sortOrder: 2,
      pricingModel: "fixed",
      attributeSchema: j(COPIES_ATTRIBUTE_SCHEMA),
      surcharges: Prisma.JsonNull,
      servicePriceDefault: null,
      dimensionsRequired: false,
      hasCustomizer: false,
      customizerType: null,
      needsApproval: false,
    },
  });
  await prisma.product.createMany({
    data: [
      { categoryId: cat3.id, name: "Сканирование — Фото", sku: "SCAN-FOTO", sellingPrice: 5, sortOrder: 0, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat3.id, name: "Сканирование — Документы", sku: "SCAN-ACTE", sellingPrice: 3, sortOrder: 1, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
    ],
  });

  const cat4 = await prisma.productCategory.create({
    data: {
      name: "Фото на документы",
      slug: "foto-acte",
      icon: "Camera",
      sortOrder: 3,
      pricingModel: "fixed",
      attributeSchema: j(FOTO_SETS_ATTRIBUTE_SCHEMA),
      surcharges: j(FOTO_SURCHARGES),
      servicePriceDefault: null,
      dimensionsRequired: false,
      hasCustomizer: false,
      customizerType: null,
      needsApproval: false,
    },
  });
  await prisma.product.createMany({
    data: [
      { categoryId: cat4.id, name: "Фото 3×4 / 3.5×4.5 — 4 шт", sku: "FOTO-3X4-4", sellingPrice: 50, sortOrder: 0, priceTiers: j([{ minQty: 1, maxQty: 1, price: 50 }]), attributes: Prisma.JsonNull },
      { categoryId: cat4.id, name: "Фото 3×4 / 3.5×4.5 — 6 шт", sku: "FOTO-3X4-6", sellingPrice: 55, sortOrder: 1, priceTiers: j([{ minQty: 1, maxQty: 1, price: 55 }]), attributes: Prisma.JsonNull },
      { categoryId: cat4.id, name: "Фото 3×4 / 3.5×4.5 — 8 шт", sku: "FOTO-3X4-8", sellingPrice: 60, sortOrder: 2, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat4.id, name: "Фото 3×4 / 3.5×4.5 — 12 шт", sku: "FOTO-3X4-12", sellingPrice: 70, sortOrder: 3, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat4.id, name: "Фото 5×5 — 2 шт", sku: "FOTO-5X5-2", sellingPrice: 50, sortOrder: 4, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat4.id, name: "Фото 5×5 — e-format", sku: "FOTO-5X5-EFMT", sellingPrice: 40, sortOrder: 5, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat4.id, name: "Фото 5×5 — 2 шт + e-format", sku: "FOTO-5X5-2E", sellingPrice: 60, sortOrder: 6, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat4.id, name: "Фото 3.3×4.8 — 4 шт", sku: "FOTO-33X48-4", sellingPrice: 50, sortOrder: 7, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat4.id, name: "Фото 4×6 — 3 шт", sku: "FOTO-4X6-3", sellingPrice: 50, sortOrder: 8, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat4.id, name: "Фото 3×4 + 10×15 (9×12) — 4+1 шт", sku: "FOTO-3X4-10X15", sellingPrice: 60, sortOrder: 9, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
    ],
  });

  const cat5 = await prisma.productCategory.create({
    data: {
      name: "Визитки",
      slug: "business-cards",
      icon: "CreditCard",
      sortOrder: 4,
      pricingModel: "fixed",
      servicePriceDefault: 0,
      attributeSchema: j(BC_COPIES_ATTRIBUTE_SCHEMA),
      surcharges: j(BC_SURCHARGES),
      dimensionsRequired: false,
      hasCustomizer: false,
      customizerType: null,
      needsApproval: false,
    },
  });
  await prisma.product.createMany({
    data: [
      {
        categoryId: cat5.id,
        name: "Визитки Simple — 1 сторона",
        sku: "BC-SIMPLE-1S",
        sellingPrice: 1.2,
        sortOrder: 0,
        minQuantity: 48,
        leadTimeDays: "1-3",
        priceTiers: j([
          { minQty: 48, maxQty: 999, price: 1.2 },
          { minQty: 1000, maxQty: 1000, price: 0, totalFixed: 550 },
          { minQty: 2000, maxQty: null, price: 0, totalFixed: 950 },
        ]),
        attributes: Prisma.JsonNull,
      },
      {
        categoryId: cat5.id,
        name: "Визитки Simple — 2 стороны",
        sku: "BC-SIMPLE-2S",
        sellingPrice: 1.5,
        sortOrder: 1,
        minQuantity: 48,
        leadTimeDays: "1-3",
        priceTiers: j([
          { minQty: 48, maxQty: 999, price: 1.5 },
          { minQty: 1000, maxQty: 1000, price: 0, totalFixed: 850 },
        ]),
        attributes: Prisma.JsonNull,
      },
      {
        categoryId: cat5.id,
        name: "Визитки Plastic — 1 сторона",
        sku: "BC-PLASTIC-1S",
        sellingPrice: 6.5,
        sortOrder: 2,
        minQuantity: 50,
        leadTimeDays: "5-10",
        priceTiers: j([{ minQty: 50, maxQty: null, price: 6.5 }]),
        attributes: Prisma.JsonNull,
      },
      {
        categoryId: cat5.id,
        name: "Визитки Plastic — 2 стороны",
        sku: "BC-PLASTIC-2S",
        sellingPrice: 9.5,
        sortOrder: 3,
        minQuantity: 50,
        leadTimeDays: "5-10",
        priceTiers: j([{ minQty: 50, maxQty: null, price: 9.5 }]),
        attributes: Prisma.JsonNull,
      },
      {
        categoryId: cat5.id,
        name: "Визитки Plastic — с нумерацией",
        sku: "BC-PLASTIC-NUM",
        sellingPrice: 18,
        sortOrder: 4,
        minQuantity: 50,
        leadTimeDays: "5-10",
        priceTiers: j([{ minQty: 50, maxQty: null, price: 18 }]),
        attributes: Prisma.JsonNull,
      },
      {
        categoryId: cat5.id,
        name: "Визитки Soft Touch — 1 сторона",
        sku: "BC-SOFTTOUCH-1S",
        sellingPrice: 8.5,
        sortOrder: 5,
        minQuantity: 100,
        leadTimeDays: "14-20",
        priceTiers: j([{ minQty: 100, maxQty: null, price: 8.5 }]),
        attributes: Prisma.JsonNull,
      },
      {
        categoryId: cat5.id,
        name: "Визитки Soft Touch — 2 стороны",
        sku: "BC-SOFTTOUCH-2S",
        sellingPrice: 12.5,
        sortOrder: 6,
        minQuantity: 100,
        leadTimeDays: "14-20",
        priceTiers: j([{ minQty: 100, maxQty: null, price: 12.5 }]),
        attributes: Prisma.JsonNull,
      },
    ],
  });

  const cat6 = await prisma.productCategory.create({
    data: {
      name: "Печать на кружках",
      slug: "mug-printing",
      icon: "Coffee",
      sortOrder: 5,
      pricingModel: "per_unit",
      servicePriceDefault: 50,
      attributeSchema: j(MUG_ATTRIBUTE_SCHEMA),
      surcharges: Prisma.JsonNull,
      dimensionsRequired: false,
      hasCustomizer: true,
      customizerType: "mug",
      needsApproval: true,
    },
  });
  await prisma.product.createMany({
    data: [
      { categoryId: cat6.id, name: "Кружка белая 330мл", sku: "MUG-W-330", costPrice: 35, sellingPrice: 120, sortOrder: 0, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat6.id, name: "Кружка белая 450мл", sku: "MUG-W-450", costPrice: 45, sellingPrice: 140, sortOrder: 1, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat6.id, name: "Кружка чёрная магическая 330мл", sku: "MUG-MAGIC-330", costPrice: 55, sellingPrice: 150, sortOrder: 2, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
    ],
  });

  await prisma.productCategory.create({
    data: {
      name: "Печать на текстиле",
      slug: "textile-printing",
      icon: "Shirt",
      sortOrder: 6,
      pricingModel: "per_unit",
      servicePriceDefault: 80,
      attributeSchema: j(TEXTILE_ATTRIBUTE_SCHEMA),
      surcharges: Prisma.JsonNull,
      dimensionsRequired: false,
      hasCustomizer: false,
      customizerType: null,
      needsApproval: false,
    },
  });

  const cat8 = await prisma.productCategory.create({
    data: {
      name: "Сувенирная продукция",
      slug: "souvenirs",
      icon: "Gift",
      sortOrder: 7,
      pricingModel: "per_unit",
      servicePriceDefault: 60,
      attributeSchema: j(SOUVENIR_ATTRIBUTE_SCHEMA),
      surcharges: Prisma.JsonNull,
      dimensionsRequired: false,
      hasCustomizer: false,
      customizerType: null,
      needsApproval: false,
    },
  });
  await prisma.product.createMany({
    data: [
      { categoryId: cat8.id, name: "Термос Stanley 500мл", sku: "THERM-STANLEY-500", costPrice: 180, sellingPrice: 250, sortOrder: 0, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat8.id, name: "Блокнот A5", sku: "NOTE-A5-ENGR", costPrice: 40, sellingPrice: 80, sortOrder: 1, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
    ],
  });

  await prisma.productCategory.create({
    data: {
      name: "Баннеры и вывески",
      slug: "banners",
      icon: "Flag",
      sortOrder: 8,
      pricingModel: "per_sqm",
      servicePriceDefault: 350,
      dimensionsRequired: true,
      attributeSchema: j(BANNER_ATTRIBUTE_SCHEMA),
      surcharges: Prisma.JsonNull,
      hasCustomizer: false,
      customizerType: null,
      needsApproval: false,
    },
  });

  await prisma.productCategory.create({
    data: {
      name: "Широкоформатная печать",
      slug: "large-format",
      icon: "Image",
      sortOrder: 9,
      pricingModel: "per_sqm",
      servicePriceDefault: 500,
      dimensionsRequired: true,
      attributeSchema: j(LARGE_FORMAT_ATTRIBUTE_SCHEMA),
      surcharges: Prisma.JsonNull,
      hasCustomizer: false,
      customizerType: null,
      needsApproval: false,
    },
  });

  await prisma.productCategory.create({
    data: {
      name: "Книги и брошюры",
      slug: "books-brochures",
      icon: "BookOpen",
      sortOrder: 10,
      pricingModel: "fixed",
      attributeSchema: j(BOOKS_ATTRIBUTE_SCHEMA),
      surcharges: Prisma.JsonNull,
      servicePriceDefault: null,
      dimensionsRequired: false,
      hasCustomizer: false,
      customizerType: null,
      needsApproval: false,
    },
  });

  await prisma.productCategory.create({
    data: {
      name: "Стикеры и наклейки",
      slug: "stickers",
      icon: "Sticker",
      sortOrder: 11,
      pricingModel: "fixed",
      attributeSchema: j(STICKERS_ATTRIBUTE_SCHEMA),
      surcharges: Prisma.JsonNull,
      servicePriceDefault: null,
      dimensionsRequired: false,
      hasCustomizer: false,
      customizerType: null,
      needsApproval: false,
    },
  });

  const cat13 = await prisma.productCategory.create({
    data: {
      name: "Брошюровка",
      slug: "brosurare",
      icon: "BookOpen",
      sortOrder: 12,
      pricingModel: "fixed",
      attributeSchema: j(BROSURARE_ATTRIBUTE_SCHEMA),
      surcharges: Prisma.JsonNull,
      servicePriceDefault: null,
      dimensionsRequired: false,
      hasCustomizer: false,
      customizerType: null,
      needsApproval: false,
    },
  });
  const brosRows: Prisma.ProductCreateManyInput[] = [
    { categoryId: cat13.id, name: "Брошюровка 6 mm", sku: "BROS-6MM", sellingPrice: 25, sortOrder: 0, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
    { categoryId: cat13.id, name: "Брошюровка 8 mm", sku: "BROS-8MM", sellingPrice: 27, sortOrder: 1, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
    { categoryId: cat13.id, name: "Брошюровка 10 mm", sku: "BROS-10MM", sellingPrice: 30, sortOrder: 2, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
    { categoryId: cat13.id, name: "Брошюровка 12 mm", sku: "BROS-12MM", sellingPrice: 32, sortOrder: 3, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
    { categoryId: cat13.id, name: "Брошюровка 14 mm", sku: "BROS-14MM", sellingPrice: 35, sortOrder: 4, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
    { categoryId: cat13.id, name: "Брошюровка 16 mm", sku: "BROS-16MM", sellingPrice: 38, sortOrder: 5, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
    { categoryId: cat13.id, name: "Брошюровка 20 mm", sku: "BROS-20MM", sellingPrice: 45, sortOrder: 6, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
    { categoryId: cat13.id, name: "Брошюровка 25 mm", sku: "BROS-25MM", sellingPrice: 50, sortOrder: 7, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
    { categoryId: cat13.id, name: "Брошюровка 32 mm", sku: "BROS-32MM", sellingPrice: 58, sortOrder: 8, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
    { categoryId: cat13.id, name: "Брошюровка 40 mm", sku: "BROS-40MM", sellingPrice: 68, sortOrder: 9, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
    { categoryId: cat13.id, name: "Брошюровка 50 mm", sku: "BROS-50MM", sellingPrice: 80, sortOrder: 10, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
  ];
  await prisma.product.createMany({ data: brosRows });

  const cat14 = await prisma.productCategory.create({
    data: {
      name: "Ламинирование",
      slug: "laminare",
      icon: "Layers",
      sortOrder: 13,
      pricingModel: "fixed",
      attributeSchema: j(LAMINARE_ATTRIBUTE_SCHEMA),
      surcharges: Prisma.JsonNull,
      servicePriceDefault: null,
      dimensionsRequired: false,
      hasCustomizer: false,
      customizerType: null,
      needsApproval: false,
    },
  });
  await prisma.product.createMany({
    data: [
      { categoryId: cat14.id, name: "Ламинирование A3 — глянец", sku: "LAM-A3-LUCI", sellingPrice: 25, sortOrder: 0, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat14.id, name: "Ламинирование A4 — глянец", sku: "LAM-A4-LUCI", sellingPrice: 20, sortOrder: 1, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat14.id, name: "Ламинирование A5 — глянец", sku: "LAM-A5-LUCI", sellingPrice: 16, sortOrder: 2, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat14.id, name: "Ламинирование A6 — глянец", sku: "LAM-A6-LUCI", sellingPrice: 13, sortOrder: 3, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat14.id, name: "Ламинирование A3 — мат", sku: "LAM-A3-MAT", sellingPrice: 22, sortOrder: 4, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat14.id, name: "Ламинирование A4 — мат", sku: "LAM-A4-MAT", sellingPrice: 17, sortOrder: 5, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat14.id, name: "Ламинирование A5 — мат", sku: "LAM-A5-MAT", sellingPrice: 13, sortOrder: 6, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
      { categoryId: cat14.id, name: "Ламинирование A6 — мат", sku: "LAM-A6-MAT", sellingPrice: 10, sortOrder: 7, priceTiers: Prisma.JsonNull, attributes: Prisma.JsonNull },
    ],
  });

  console.log("ANVI catalog and users seeded.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

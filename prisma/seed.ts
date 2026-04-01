import { PrismaClient, Prisma } from "@prisma/client";
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

interface PriceTierSeed {
  minQty: number;
  maxQty: number | null;
  price: number;
  totalFixed?: number | null;
}

interface SurchargeSeed {
  key: string;
  label: { ro: string; ru: string; en: string };
  pricePerUnit: number;
}

interface ProductSeed {
  name: string;
  sku: string;
  description?: string;
  costPrice?: number;
  sellingPrice?: number;
  priceTiers?: PriceTierSeed[];
  minQuantity?: number;
  leadTimeDays?: string;
  attributes?: Record<string, unknown>;
}

interface CategorySeed {
  name: string;
  slug: string;
  description: string;
  icon: string;
  sortOrder: number;
  pricingModel?: "fixed" | "per_sqm" | "per_unit";
  servicePriceDefault?: number;
  dimensionsRequired?: boolean;
  surcharges?: SurchargeSeed[];
  attributeSchema: {
    fields: Array<{
      key: string;
      label: { ro: string; ru: string; en: string };
      type: "text" | "number" | "select" | "boolean";
      required: boolean;
      options?: Array<{ value: string; label: { ro: string; ru: string; en: string } }>;
      min?: number;
      defaultValue?: string | number | boolean;
    }>;
  };
  products?: ProductSeed[];
}

const CATEGORIES: CategorySeed[] = [
  // ───────────────────────── Page 6: TIPAR ─────────────────────────
  {
    name: "Xerox (Ч/Б копии)",
    slug: "xerox",
    description: "Черно-белое копирование и печать — Xerox",
    icon: "FileText",
    sortOrder: 0,
    pricingModel: "fixed",
    attributeSchema: {
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
    },
    products: [
      { name: "Xerox A4 — Pe o parte", sku: "XRX-A4-1S", sellingPrice: 2, leadTimeDays: "0" },
      { name: "Xerox A4 — Duplex (față-verso)", sku: "XRX-A4-DPX", sellingPrice: 4, leadTimeDays: "0" },
      { name: "Xerox A3 — Pe o parte", sku: "XRX-A3-1S", sellingPrice: 4, leadTimeDays: "0" },
      { name: "Xerox A3 — Duplex (față-verso)", sku: "XRX-A3-DPX", sellingPrice: 8, leadTimeDays: "0" },
      { name: "Xerox Buletin", sku: "XRX-BULETIN", sellingPrice: 4, leadTimeDays: "0" },
      { name: "Xerox Carte (față-verso)", sku: "XRX-CARTE-DPX", sellingPrice: 4, leadTimeDays: "0", description: "A4 = 4 lei, A3 = 8 lei" },
    ],
  },
  {
    name: "Tipar Color",
    slug: "tipar-color",
    description: "Цветная печать на бумаге разной плотности",
    icon: "Palette",
    sortOrder: 1,
    pricingModel: "fixed",
    attributeSchema: {
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
    },
    products: [
      { name: "Color A4 — 80g (simplu)", sku: "CLR-A4-80G", sellingPrice: 5, leadTimeDays: "0" },
      { name: "Color A3 — 80g (simplu)", sku: "CLR-A3-80G", sellingPrice: 10, leadTimeDays: "0" },
      { name: "Color A4 — 105-150g", sku: "CLR-A4-150G", sellingPrice: 10, leadTimeDays: "0" },
      { name: "Color A3 — 105-150g", sku: "CLR-A3-150G", sellingPrice: 20, leadTimeDays: "0" },
      { name: "Color A4 — 200-350g", sku: "CLR-A4-350G", sellingPrice: 12, leadTimeDays: "0" },
      { name: "Color A3 — 200-350g", sku: "CLR-A3-350G", sellingPrice: 25, leadTimeDays: "0" },
      { name: "Color A4 — Texturat (simplu)", sku: "CLR-A4-TXT", sellingPrice: 18, leadTimeDays: "0" },
      { name: "Color A3 — Texturat (simplu)", sku: "CLR-A3-TXT", sellingPrice: 36, leadTimeDays: "0" },
    ],
  },
  {
    name: "Сканирование",
    slug: "scanare",
    description: "Сканирование документов и фотографий",
    icon: "ScanLine",
    sortOrder: 2,
    pricingModel: "fixed",
    attributeSchema: {
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
    },
    products: [
      { name: "Сканирование — Фото (A4/A3)", sku: "SCAN-FOTO", sellingPrice: 5, leadTimeDays: "0" },
      { name: "Сканирование — Документы (A4/A3)", sku: "SCAN-ACTE", sellingPrice: 3, leadTimeDays: "0" },
    ],
  },
  // ───────────────────── Page 7: FOTO ACTE ─────────────────────
  {
    name: "Фото на документы",
    slug: "foto-acte",
    description: "Фотографии для документов различных размеров",
    icon: "Camera",
    sortOrder: 3,
    pricingModel: "fixed",
    surcharges: [
      {
        key: "clothes-change",
        label: { ro: "Schimbarea hainei", ru: "Смена одежды", en: "Clothes change" },
        pricePerUnit: 10,
      },
    ],
    attributeSchema: {
      fields: [
        {
          key: "copies",
          label: { ro: "Cantitate seturi", ru: "Количество комплектов", en: "Number of sets" },
          type: "number",
          required: true,
          min: 1,
          defaultValue: 1,
        },
      ],
    },
    products: [
      {
        name: "Фото 3×4 / 3.5×4.5 — 4 шт",
        sku: "FOTO-3X4-4",
        sellingPrice: 50,
        priceTiers: [
          { minQty: 1, maxQty: 1, price: 50 },
        ],
        leadTimeDays: "0",
        description: "4 buc, format 3×4 sau 3.5×4.5",
      },
      {
        name: "Фото 3×4 / 3.5×4.5 — 6 шт",
        sku: "FOTO-3X4-6",
        sellingPrice: 55,
        priceTiers: [
          { minQty: 1, maxQty: 1, price: 55 },
        ],
        leadTimeDays: "0",
      },
      {
        name: "Фото 3×4 / 3.5×4.5 — 8 шт",
        sku: "FOTO-3X4-8",
        sellingPrice: 60,
        leadTimeDays: "0",
      },
      {
        name: "Фото 3×4 / 3.5×4.5 — 12 шт",
        sku: "FOTO-3X4-12",
        sellingPrice: 70,
        leadTimeDays: "0",
      },
      {
        name: "Фото 5×5 — 2 шт",
        sku: "FOTO-5X5-2",
        sellingPrice: 50,
        leadTimeDays: "0",
      },
      {
        name: "Фото 5×5 — e-format",
        sku: "FOTO-5X5-EFMT",
        sellingPrice: 40,
        leadTimeDays: "0",
      },
      {
        name: "Фото 5×5 — 2 шт + e-format",
        sku: "FOTO-5X5-2E",
        sellingPrice: 60,
        leadTimeDays: "0",
      },
      {
        name: "Фото 3.3×4.8 — 4 шт",
        sku: "FOTO-33X48-4",
        sellingPrice: 50,
        leadTimeDays: "0",
      },
      {
        name: "Фото 4×6 — 3 шт",
        sku: "FOTO-4X6-3",
        sellingPrice: 50,
        leadTimeDays: "0",
      },
      {
        name: "Фото 3×4 + 10×15 (9×12) — 4+1 шт",
        sku: "FOTO-3X4-10X15",
        sellingPrice: 60,
        leadTimeDays: "0",
      },
    ],
  },
  {
    name: "Визитки",
    slug: "business-cards",
    description: "Печать визитных карточек — Simple, Plastic, Soft Touch",
    icon: "CreditCard",
    sortOrder: 4,
    pricingModel: "fixed",
    servicePriceDefault: 0,
    surcharges: [
      {
        key: "rounded-corners",
        label: { ro: "Colțuri rotunde", ru: "Закруглённые углы", en: "Rounded corners" },
        pricePerUnit: 0.5,
      },
    ],
    attributeSchema: {
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
    },
    products: [
      {
        name: "Визитки Simple — 1 сторона",
        sku: "BC-SIMPLE-1S",
        description: "Визитки обычные, печать с одной стороны, 1-3 дня",
        sellingPrice: 1.2,
        priceTiers: [
          { minQty: 48, maxQty: 999, price: 1.2 },
          { minQty: 1000, maxQty: 1000, price: 0, totalFixed: 550 },
          { minQty: 2000, maxQty: null, price: 0, totalFixed: 950 },
        ],
        minQuantity: 48,
        leadTimeDays: "1-3",
      },
      {
        name: "Визитки Simple — 2 стороны",
        sku: "BC-SIMPLE-2S",
        description: "Визитки обычные, печать с двух сторон, 1-3 дня",
        sellingPrice: 1.5,
        priceTiers: [
          { minQty: 48, maxQty: 999, price: 1.5 },
          { minQty: 1000, maxQty: 1000, price: 0, totalFixed: 850 },
        ],
        minQuantity: 48,
        leadTimeDays: "1-3",
      },
      {
        name: "Визитки Plastic — 1 сторона",
        sku: "BC-PLASTIC-1S",
        description: "Визитки пластиковые, печать с одной стороны, 5-10 дней",
        sellingPrice: 6.5,
        priceTiers: [
          { minQty: 50, maxQty: null, price: 6.5 },
        ],
        minQuantity: 50,
        leadTimeDays: "5-10",
      },
      {
        name: "Визитки Plastic — 2 стороны",
        sku: "BC-PLASTIC-2S",
        description: "Визитки пластиковые, печать с двух сторон, 5-10 дней",
        sellingPrice: 9.5,
        priceTiers: [
          { minQty: 50, maxQty: null, price: 9.5 },
        ],
        minQuantity: 50,
        leadTimeDays: "5-10",
      },
      {
        name: "Визитки Plastic — с нумерацией",
        sku: "BC-PLASTIC-NUM",
        description: "Визитки пластиковые с нумерацией, 5-10 дней",
        sellingPrice: 18,
        priceTiers: [
          { minQty: 50, maxQty: null, price: 18 },
        ],
        minQuantity: 50,
        leadTimeDays: "5-10",
      },
      {
        name: "Визитки Soft Touch — 1 сторона",
        sku: "BC-SOFTTOUCH-1S",
        description: "Визитки Soft Touch, печать с одной стороны, 14-20 дней",
        sellingPrice: 8.5,
        priceTiers: [
          { minQty: 100, maxQty: null, price: 8.5 },
        ],
        minQuantity: 100,
        leadTimeDays: "14-20",
      },
      {
        name: "Визитки Soft Touch — 2 стороны",
        sku: "BC-SOFTTOUCH-2S",
        description: "Визитки Soft Touch, печать с двух сторон, 14-20 дней",
        sellingPrice: 12.5,
        priceTiers: [
          { minQty: 100, maxQty: null, price: 12.5 },
        ],
        minQuantity: 100,
        leadTimeDays: "14-20",
      },
    ],
  },
  {
    name: "Печать на кружках",
    slug: "mug-printing",
    description: "Сублимационная и UV-печать на кружках",
    icon: "Coffee",
    sortOrder: 5,
    pricingModel: "per_unit",
    servicePriceDefault: 50,
    attributeSchema: {
      fields: [
        {
          key: "printType",
          label: { ro: "Tip imprimare", ru: "Тип печати", en: "Print Type" },
          type: "select",
          required: true,
          options: [
            { value: "sublimation", label: { ro: "Sublimare", ru: "Сублимация", en: "Sublimation" } },
            { value: "uv", label: { ro: "UV", ru: "UV", en: "UV" } },
          ],
          defaultValue: "sublimation",
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
    },
    products: [
      { name: "Кружка белая 330мл", sku: "MUG-W-330", costPrice: 35, sellingPrice: 120, attributes: { volume: "330ml", color: "white" } },
      { name: "Кружка белая 450мл", sku: "MUG-W-450", costPrice: 45, sellingPrice: 140, attributes: { volume: "450ml", color: "white" } },
      { name: "Кружка чёрная магическая 330мл", sku: "MUG-MAGIC-330", costPrice: 55, sellingPrice: 150, attributes: { volume: "330ml", color: "magic-black" } },
    ],
  },
  {
    name: "Печать на текстиле",
    slug: "textile-printing",
    description: "Печать на футболках, кепках и другом текстиле",
    icon: "Shirt",
    sortOrder: 6,
    pricingModel: "per_unit",
    servicePriceDefault: 80,
    attributeSchema: {
      fields: [
        {
          key: "itemType",
          label: { ro: "Tip articol", ru: "Тип изделия", en: "Item Type" },
          type: "select",
          required: true,
          options: [
            { value: "tshirt", label: { ro: "Tricou", ru: "Футболка", en: "T-Shirt" } },
            { value: "hoodie", label: { ro: "Hanorac", ru: "Худи", en: "Hoodie" } },
            { value: "cap", label: { ro: "Șapcă", ru: "Кепка", en: "Cap" } },
            { value: "other", label: { ro: "Altul", ru: "Другое", en: "Other" } },
          ],
        },
        {
          key: "size",
          label: { ro: "Mărime", ru: "Размер", en: "Size" },
          type: "select",
          required: false,
          options: [
            { value: "XS", label: { ro: "XS", ru: "XS", en: "XS" } },
            { value: "S", label: { ro: "S", ru: "S", en: "S" } },
            { value: "M", label: { ro: "M", ru: "M", en: "M" } },
            { value: "L", label: { ro: "L", ru: "L", en: "L" } },
            { value: "XL", label: { ro: "XL", ru: "XL", en: "XL" } },
            { value: "XXL", label: { ro: "XXL", ru: "XXL", en: "XXL" } },
          ],
        },
        {
          key: "printType",
          label: { ro: "Tip imprimare", ru: "Тип печати", en: "Print Type" },
          type: "select",
          required: true,
          options: [
            { value: "dtf", label: { ro: "DTF", ru: "DTF", en: "DTF" } },
            { value: "sublimation", label: { ro: "Sublimare", ru: "Сублимация", en: "Sublimation" } },
            { value: "screen", label: { ro: "Serigrafie", ru: "Шелкография", en: "Screen Print" } },
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
    },
  },
  {
    name: "Сувенирная продукция",
    slug: "souvenirs",
    description: "Печать на термосах, блокнотах и других сувенирах",
    icon: "Gift",
    sortOrder: 7,
    pricingModel: "per_unit",
    servicePriceDefault: 60,
    attributeSchema: {
      fields: [
        {
          key: "printType",
          label: { ro: "Tip imprimare", ru: "Тип печати", en: "Print Type" },
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
    },
    products: [
      { name: "Термос Stanley 500мл", sku: "THERM-STANLEY-500", costPrice: 180, sellingPrice: 250, attributes: { volume: "500ml" } },
      { name: "Блокнот A5 с гравировкой", sku: "NOTE-A5-ENGR", costPrice: 40, sellingPrice: 80, attributes: { size: "A5" } },
    ],
  },
  {
    name: "Баннеры и вывески",
    slug: "banners",
    description: "Баннеры, вывески, рекламные конструкции",
    icon: "Flag",
    sortOrder: 8,
    pricingModel: "per_sqm",
    servicePriceDefault: 350,
    dimensionsRequired: true,
    attributeSchema: {
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
        {
          key: "width",
          label: { ro: "Lățime (cm)", ru: "Ширина (см)", en: "Width (cm)" },
          type: "number",
          required: true,
          min: 1,
        },
        {
          key: "height",
          label: { ro: "Înălțime (cm)", ru: "Высота (см)", en: "Height (cm)" },
          type: "number",
          required: true,
          min: 1,
        },
        {
          key: "eyelets",
          label: { ro: "Ochiuri", ru: "Люверсы", en: "Eyelets" },
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
    },
  },
  {
    name: "Широкоформатная печать",
    slug: "large-format",
    description: "Печать на дюбонде, пластике, холсте, постеры",
    icon: "Image",
    sortOrder: 9,
    pricingModel: "per_sqm",
    servicePriceDefault: 500,
    dimensionsRequired: true,
    attributeSchema: {
      fields: [
        {
          key: "material",
          label: { ro: "Material", ru: "Материал", en: "Material" },
          type: "select",
          required: true,
          options: [
            { value: "dibond", label: { ro: "Dibond", ru: "Дюбонд", en: "Dibond" } },
            { value: "pvc", label: { ro: "PVC / Plastic", ru: "ПВХ / Пластик", en: "PVC / Plastic" } },
            { value: "canvas", label: { ro: "Canvas", ru: "Холст", en: "Canvas" } },
            { value: "photo-paper", label: { ro: "Hârtie foto", ru: "Фотобумага", en: "Photo Paper" } },
            { value: "poster", label: { ro: "Poster", ru: "Постер", en: "Poster" } },
          ],
        },
        {
          key: "width",
          label: { ro: "Lățime (cm)", ru: "Ширина (см)", en: "Width (cm)" },
          type: "number",
          required: true,
          min: 1,
        },
        {
          key: "height",
          label: { ro: "Înălțime (cm)", ru: "Высота (см)", en: "Height (cm)" },
          type: "number",
          required: true,
          min: 1,
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
    },
  },
  {
    name: "Книги и брошюры",
    slug: "books-brochures",
    description: "Печать и переплёт книг, брошюр, каталогов",
    icon: "BookOpen",
    sortOrder: 10,
    pricingModel: "fixed",
    attributeSchema: {
      fields: [
        {
          key: "bindingType",
          label: { ro: "Tip legare", ru: "Тип переплёта", en: "Binding Type" },
          type: "select",
          required: true,
          options: [
            { value: "staple", label: { ro: "Capse", ru: "Скобы", en: "Staple" } },
            { value: "spiral", label: { ro: "Spirală", ru: "Пружина", en: "Spiral" } },
            { value: "perfect", label: { ro: "Lipire", ru: "Клеевой", en: "Perfect Binding" } },
            { value: "hardcover", label: { ro: "Copertă tare", ru: "Твёрдый переплёт", en: "Hardcover" } },
          ],
        },
        {
          key: "paperSize",
          label: { ro: "Format", ru: "Формат", en: "Size" },
          type: "select",
          required: true,
          options: [
            { value: "A4", label: { ro: "A4", ru: "A4", en: "A4" } },
            { value: "A5", label: { ro: "A5", ru: "A5", en: "A5" } },
            { value: "A6", label: { ro: "A6", ru: "A6", en: "A6" } },
          ],
          defaultValue: "A4",
        },
        {
          key: "color",
          label: { ro: "Mod imprimare", ru: "Режим печати", en: "Print Mode" },
          type: "select",
          required: true,
          options: [
            { value: "bw", label: { ro: "Alb-negru", ru: "Ч/Б", en: "B&W" } },
            { value: "color", label: { ro: "Color", ru: "Цвет", en: "Color" } },
          ],
          defaultValue: "bw",
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
    },
  },
  {
    name: "Стикеры и наклейки",
    slug: "stickers",
    description: "Печать стикеров и наклеек на различных материалах",
    icon: "Sticker",
    sortOrder: 11,
    attributeSchema: {
      fields: [
        {
          key: "material",
          label: { ro: "Material", ru: "Материал", en: "Material" },
          type: "select",
          required: true,
          options: [
            { value: "vinyl", label: { ro: "Vinil", ru: "Винил", en: "Vinyl" } },
            { value: "paper", label: { ro: "Hârtie", ru: "Бумага", en: "Paper" } },
            { value: "transparent", label: { ro: "Transparent", ru: "Прозрачная", en: "Transparent" } },
          ],
        },
        {
          key: "shape",
          label: { ro: "Formă", ru: "Форма", en: "Shape" },
          type: "select",
          required: false,
          options: [
            { value: "rectangle", label: { ro: "Dreptunghi", ru: "Прямоугольник", en: "Rectangle" } },
            { value: "circle", label: { ro: "Cerc", ru: "Круг", en: "Circle" } },
            { value: "custom", label: { ro: "Formă personalizată", ru: "Произвольная", en: "Custom Shape" } },
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
    },
  },
  // ───────────────────── Page 8: BROȘURARE & LAMINARE ─────────────────────
  {
    name: "Брошюровка (переплёт)",
    slug: "brosurare",
    description: "Брошюровка на пластиковой или металлической пружине",
    icon: "BookOpen",
    sortOrder: 12,
    pricingModel: "fixed",
    attributeSchema: {
      fields: [
        {
          key: "bindType",
          label: { ro: "Tip", ru: "Тип", en: "Binding Type" },
          type: "select",
          required: true,
          options: [
            { value: "plastic", label: { ro: "Plastic", ru: "Пластик", en: "Plastic" } },
            { value: "metal", label: { ro: "Metal", ru: "Металл", en: "Metal" } },
          ],
          defaultValue: "plastic",
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
    },
    products: [
      { name: "Брошюровка 6мм (до 20 листов)", sku: "BROS-6MM", sellingPrice: 25, description: "6mm, până la 20 foi" },
      { name: "Брошюровка 8мм (до 30 листов)", sku: "BROS-8MM", sellingPrice: 30, description: "8mm, până la 30 foi" },
      { name: "Брошюровка 10мм (до 40 листов)", sku: "BROS-10MM", sellingPrice: 35, description: "10mm, până la 40 foi" },
      { name: "Брошюровка 12мм (до 70 листов)", sku: "BROS-12MM", sellingPrice: 40, description: "12mm, până la 70 foi" },
      { name: "Брошюровка 14мм (до 100 листов)", sku: "BROS-14MM", sellingPrice: 45, description: "14mm, până la 100 foi" },
      { name: "Брошюровка 16мм (до 120 листов)", sku: "BROS-16MM", sellingPrice: 50, description: "16mm, până la 120 foi" },
      { name: "Брошюровка 20мм (до 150 листов)", sku: "BROS-20MM", sellingPrice: 55, description: "20mm, până la 150 foi" },
      { name: "Брошюровка 22мм (до 180 листов)", sku: "BROS-22MM", sellingPrice: 60, description: "22mm, până la 180 foi" },
      { name: "Брошюровка 25мм (до 200 листов)", sku: "BROS-25MM", sellingPrice: 65, description: "25mm, până la 200 foi" },
      { name: "Брошюровка 35мм (до 250 листов)", sku: "BROS-35MM", sellingPrice: 70, description: "35mm, până la 250 foi" },
      { name: "Брошюровка 50мм (до 300 листов)", sku: "BROS-50MM", sellingPrice: 80, description: "50mm, până la 300 foi" },
    ],
  },
  {
    name: "Ламинирование",
    slug: "laminare",
    description: "Ламинирование документов — глянцевое или матовое",
    icon: "Layers",
    sortOrder: 13,
    pricingModel: "fixed",
    attributeSchema: {
      fields: [
        {
          key: "finish",
          label: { ro: "Finisaj", ru: "Покрытие", en: "Finish" },
          type: "select",
          required: true,
          options: [
            { value: "glossy", label: { ro: "Lucios", ru: "Глянец", en: "Glossy" } },
            { value: "matte", label: { ro: "Mat", ru: "Мат", en: "Matte" } },
          ],
          defaultValue: "glossy",
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
    },
    products: [
      { name: "Ламинирование A3 — глянец", sku: "LAM-A3-LUCI", sellingPrice: 25 },
      { name: "Ламинирование A3 — мат", sku: "LAM-A3-MAT", sellingPrice: 35 },
      { name: "Ламинирование A4 — глянец", sku: "LAM-A4-LUCI", sellingPrice: 15 },
      { name: "Ламинирование A4 — мат", sku: "LAM-A4-MAT", sellingPrice: 25 },
      { name: "Ламинирование A5 — глянец", sku: "LAM-A5-LUCI", sellingPrice: 10 },
      { name: "Ламинирование A5 — мат", sku: "LAM-A5-MAT", sellingPrice: 20 },
      { name: "Ламинирование A6 — глянец", sku: "LAM-A6-LUCI", sellingPrice: 5 },
      { name: "Ламинирование A6 — мат", sku: "LAM-A6-MAT", sellingPrice: 10 },
    ],
  },
];

async function main() {
  console.log("Cleaning database...");
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

  const hashed = hashPassword(DEFAULT_PASSWORD);

  for (const { name, role } of USERS) {
    await prisma.user.create({
      data: { name, role, password: hashed },
    });
    console.log(`Created ${role}: ${name}`);
  }

  console.log(`\nAll ${USERS.length} users created. Password for all: ${DEFAULT_PASSWORD}`);

  console.log("\nSeeding product categories and products...");

  for (const cat of CATEGORIES) {
    const category = await prisma.productCategory.create({
      data: {
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        icon: cat.icon,
        attributeSchema: cat.attributeSchema,
        pricingModel: cat.pricingModel ?? "fixed",
        servicePriceDefault: cat.servicePriceDefault ?? null,
        dimensionsRequired: cat.dimensionsRequired ?? false,
        surcharges: cat.surcharges ? (cat.surcharges as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        sortOrder: cat.sortOrder,
      },
    });
    console.log(`Created category: ${cat.name} (${cat.slug})`);

    if (cat.products) {
      for (const prod of cat.products) {
        await prisma.product.create({
          data: {
            categoryId: category.id,
            name: prod.name,
            sku: prod.sku,
            description: prod.description,
            costPrice: prod.costPrice ?? null,
            sellingPrice: prod.sellingPrice ?? null,
            priceTiers: prod.priceTiers ? (prod.priceTiers as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
            minQuantity: prod.minQuantity ?? null,
            leadTimeDays: prod.leadTimeDays ?? null,
            attributes: prod.attributes as Prisma.InputJsonValue | undefined,
          },
        });
        console.log(`  Created product: ${prod.name} (${prod.sku})`);
      }
    }
  }

  console.log(`\n${CATEGORIES.length} categories seeded.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

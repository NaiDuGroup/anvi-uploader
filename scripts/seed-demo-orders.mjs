/**
 * Seed demo orders for local visualization.
 * Creates: 5 LF orders (3 materials), 3 mug orders, 3 notebook orders,
 *          2 paper-print orders, 2 mixed orders (LF+paper).
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { nanoid } from "nanoid";

const prisma = new PrismaClient();

// ── Constants from DB ────────────────────────────────────────────────────────

const USERS = {
  anatolie: "dfde16c5-9437-4921-91a8-85b345b0be86",
  angelina:  "b19c2d9c-c488-4392-970f-d52809616bae",
  elvira:    "03c5febd-e391-4fa7-a4d1-779e8e7359aa",
  daria:     "aa1137f1-6fcf-45fa-8562-a728034e1032",
};

const CLIENTS = {
  alina:    { id: "e5e12ad3-fe21-4830-9766-f03f1134da91", phone: "+37368294227", name: "PARTYDECORmd (Alina)" },
  alexei:   { id: "2f95a948-717d-4185-bb4c-023b479c0748", phone: "+37378123060", name: "Alexei Fresh air" },
  vlad:     { id: "8ef22571-68f1-474d-81cc-6e23d7f3cfc5", phone: "+37368609209", name: "Vlad Andreev Photograf" },
  motinga:  { id: "23cb21e0-f459-4bc4-97e7-6b45d0fbd4f7", phone: "+37368670026", name: "Motînga Alexandr" },
  ion:      { id: "9cd1f136-bd3d-40b7-83b7-0b7b11436a95", phone: "+37378526864", name: "Ion" },
  ivan:     { id: "4a358f2c-7a18-47d8-af87-db8ad4899c1d", phone: "079568194",    name: "Chihaial Ivan" },
  victoria: { id: "e88a01ea-89ff-4380-b8e1-5b0c68e2760a", phone: "+37378249352", name: "Victoria Lemica" },
};

const LF = {
  oracalMatt:  { id: "ed16fe76-a20d-4182-89b6-979877f9f1f1", name: "ORACAL MATT 1.27*50m",         width: 1.27, printable: 1.22 },
  oracalGloss: { id: "7fda3cba-9100-45c9-ba02-7a0f8ee06a9f", name: "ORACAL GLOSS 1.27*50m",        width: 1.27, printable: 1.22 },
  bannerRollUp:{ id: "3c8aef0b-cf0a-4306-9257-3d08b4a42f30", name: "BANNER Roll Up MATT 1.07*30m",  width: 1.07, printable: 1.02 },
  bannerMatt:  { id: "66b19d4e-cc8e-44b2-a292-07f80df27fff", name: "BANNER MATT 1.37*50m",          width: 1.37, printable: 1.32 },
  photo:       { id: "c5d82456-f57d-46eb-b02e-f4c06f9e4a25", name: "PHOTO PAPER 200G 1.07*75m",     width: 1.07, printable: 1.02 },
  canvas:      { id: "e5d742b7-d480-455e-8160-4f9f00f11a13", name: "Panza din bumbac 1.07*20m",     width: 1.07, printable: 1.02 },
};

const MUGS = {
  yellow:  { id: "7a2da975-742f-4018-8740-eb4a4cb80bca", sku: "S3-KJRJ-320", nameRu: "Кружка жёлтая 330 мл", nameRo: "Cană galbenă 330 ml", nameEn: "Yellow mug 330 ml", bodyColorHex: "#f5f5f0", handleColorHex: "#d8c734", innerColorHex: "#d8c734", rimColorHex: "#d8c734", printWidthCm: 21, printHeightCm: 9.6, printDpi: 300, sellPrice: 150, has3dPreview: true, imageUrl: null },
  blue:    { id: "01246b29-3fa3-4db4-acda-4fda6c207852", sku: "S3-KSRS-320", nameRu: "Кружка синяя 330 мл",   nameRo: "Cană albastră 330 ml", nameEn: "Blue mug 330 ml",  bodyColorHex: "#f5f5f0", handleColorHex: "#4a90e2", innerColorHex: "#4a90e2", rimColorHex: "#4a90e2", printWidthCm: 21, printHeightCm: 9.6, printDpi: 300, sellPrice: 150, has3dPreview: true, imageUrl: null },
  green:   { id: "e051445d-7e01-4212-a8f3-896ca93744d9", sku: "S3-KZRZ-330", nameRu: "Кружка зелёная 330 мл", nameRo: "Cană verde 330 ml",    nameEn: "Green mug 330 ml", bodyColorHex: "#f5f5f0", handleColorHex: "#27ae60", innerColorHex: "#27ae60", rimColorHex: "#27ae60", printWidthCm: 21, printHeightCm: 9.6, printDpi: 300, sellPrice: 150, has3dPreview: true, imageUrl: null },
};

const NOTEBOOKS = {
  blue:  { id: "0514ac37-70f6-4209-a64f-5389fffa5b97", sku: "S3-SBL-A5", nameRu: "Блокнот синий A5",  nameRo: "Agenda Albastra A5", nameEn: "Blue Notebook A5",  coverColorHex: "#2e6fac", strapColorHex: "#2e6fac", bookmarkColorHex: "#e74c3c", printWidthCm: 14, printHeightCm: 21.4, printDpi: 300, has3dPreview: true, imageUrl: null, paperKind: "ruled" },
  green: { id: "6d2e0c7d-904a-49af-bdab-035fee3351b0", sku: "S3-ZBL-A5", nameRu: "Блокнот зелёный A5", nameRo: "Agenda Verde A5",    nameEn: "Green Notebook A5", coverColorHex: "#27ae60", strapColorHex: "#27ae60", bookmarkColorHex: "#c0392b", printWidthCm: 14, printHeightCm: 21.4, printDpi: 300, has3dPreview: true, imageUrl: null, paperKind: "squared" },
  black: { id: "7e915965-ef9e-40b4-8cb8-cc156cca72ed", sku: "S3-CBL-A5", nameRu: "Блокнот чёрный A5",  nameRo: "Agenda Neagra A5",  nameEn: "Black Notebook A5", coverColorHex: "#1f1f1f", strapColorHex: "#1f1f1f", bookmarkColorHex: "#c0392b", printWidthCm: 14, printHeightCm: 21.4, printDpi: 300, has3dPreview: true, imageUrl: null, paperKind: "ruled" },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function lfLineData(mat, widthCm, heightCm, qty, totalSell) {
  const lm = (heightCm / 100) * qty;
  return {
    materialSnapshot: {
      id: mat.id,
      name: mat.name,
      rollWidthMeters: String(mat.width),
      printableWidthMeters: String(mat.printable),
      costPerLinearMeter: 0,
      finalRetailPricePerLinearMeter: Math.round(totalSell / lm),
      finalDealerPricePerLinearMeter: Math.round(totalSell / lm * 0.65),
      dealerPricePerLinearMeter: 0,
      retailPricePerLinearMeter: 0,
      dealerPrintPricePerLinearMeter: 0,
      retailPrintPricePerLinearMeter: 0,
    },
    printWidthCm: widthCm,
    printHeightCm: heightCm,
    quantity: qty,
    customerType: "retail",
    calculatedLinearMeters: lm,
    materialCost: Math.round(totalSell * 0.3),
    materialSellPrice: Math.round(totalSell * 0.7),
    printSellPrice: Math.round(totalSell * 0.3),
    totalSellPrice: totalSell,
    estimatedProfit: Math.round(totalSell * 0.45),
    usefulAreaSqm: (widthCm / 100) * (heightCm / 100) * qty,
    writtenOffAreaSqm: lm * mat.width,
    materialEfficiencyPct: Math.round(((widthCm / 100) * (heightCm / 100) * qty / (lm * mat.width)) * 10000) / 100,
    totalDirectCostMdl: Math.round(totalSell * 0.3),
    marginPercent: 45,
  };
}

function mugSnapshot(mug) {
  const { sellPrice: _s, ...snap } = mug;
  return snap;
}

function nbSnapshot(nb) {
  return { ...nb };
}

const STATUSES = ["NEW", "IN_PROGRESS", "SENT_TO_WORKSHOP", "WORKSHOP_PRINTING", "WORKSHOP_READY", "DELIVERED"];
let statusIdx = 0;
function nextStatus() {
  return STATUSES[statusIdx++ % STATUSES.length];
}

async function createOrder({ client, assignedTo, createdBy, status, price, isPaid, isPrio, notes, productType, lines }) {
  const st = status ?? "NEW";
  const order = await prisma.order.create({
    data: {
      phone: client.phone,
      clientName: client.name,
      clientId: client.id,
      status: st,
      assignedTo: assignedTo ?? USERS.angelina,
      createdBy: createdBy ?? USERS.anatolie,
      sentToWorkshopBy: st !== "NEW" ? (createdBy ?? USERS.anatolie) : null,
      isWorkshop: ["SENT_TO_WORKSHOP","WORKSHOP_PRINTING","WORKSHOP_READY"].includes(st),
      isPrio: isPrio ?? false,
      price: price ?? null,
      isPaid: isPaid ?? false,
      notes: notes ?? null,
      productType: productType,
      needsProcurement: false,
      publicToken: randomUUID(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
  });

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const orderLine = await prisma.orderLine.create({
      data: {
        orderId: order.id,
        sortOrder: li,
        productType: line.productType,
        largeFormatMaterialId: line.largeFormatMaterialId ?? null,
        largeFormatLineData: line.largeFormatLineData ?? undefined,
        mugProductId: line.mugProductId ?? null,
        mugProductSnapshot: line.mugProductSnapshot ?? undefined,
        notebookProductId: line.notebookProductId ?? null,
        notebookProductSnapshot: line.notebookProductSnapshot ?? undefined,
      },
    });

    for (const f of (line.files ?? [])) {
      await prisma.file.create({
        data: {
          orderId: order.id,
          orderLineId: orderLine.id,
          fileName: f.fileName,
          fileUrl: f.fileUrl,
          copies: f.copies ?? 1,
          color: f.color ?? "color",
          paperType: f.paperType ?? null,
          pageCount: f.pageCount ?? null,
        },
      });
    }
  }

  return order;
}

// ── Seed ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding demo orders…\n");

  const results = [];

  // ── 1. LF: ORACAL MATT — рекламный баннер 100×150 см, 2 шт ─────────────
  results.push(await createOrder({
    client: CLIENTS.alina,
    status: nextStatus(),
    price: 520,
    isPaid: true,
    notes: "Срочно! Баннер к открытию 31 мая",
    productType: "large_format_print",
    lines: [{
      productType: "large_format_print",
      largeFormatMaterialId: LF.oracalMatt.id,
      largeFormatLineData: lfLineData(LF.oracalMatt, 100, 150, 2, 520),
      files: [{ fileName: "banner_opening.pdf", fileUrl: "uploads/demo-lf-1.pdf", copies: 2, color: "color", paperType: "large_format" }],
    }],
  }));

  // ── 2. LF: ORACAL GLOSS — наклейка 60×40 см, 5 шт ──────────────────────
  results.push(await createOrder({
    client: CLIENTS.alexei,
    status: nextStatus(),
    price: 460,
    isPaid: false,
    notes: null,
    productType: "large_format_print",
    lines: [{
      productType: "large_format_print",
      largeFormatMaterialId: LF.oracalGloss.id,
      largeFormatLineData: lfLineData(LF.oracalGloss, 60, 40, 5, 460),
      files: [{ fileName: "sticker_logo.ai.pdf", fileUrl: "uploads/demo-lf-2.pdf", copies: 5, color: "color", paperType: "large_format" }],
    }],
  }));

  // ── 3. LF: BANNER Roll Up — 85×200 см, 1 шт ────────────────────────────
  results.push(await createOrder({
    client: CLIENTS.motinga,
    status: nextStatus(),
    price: 380,
    isPaid: true,
    isPrio: true,
    notes: "Roll-up для выставки, стойка у клиента",
    productType: "large_format_print",
    lines: [{
      productType: "large_format_print",
      largeFormatMaterialId: LF.bannerRollUp.id,
      largeFormatLineData: lfLineData(LF.bannerRollUp, 85, 200, 1, 380),
      files: [{ fileName: "rollup_gusto.pdf", fileUrl: "uploads/demo-lf-3.pdf", copies: 1, color: "color", paperType: "large_format" }],
    }],
  }));

  // ── 4. LF: BANNER MATT — 120×240 см, 3 шт ──────────────────────────────
  results.push(await createOrder({
    client: CLIENTS.ion,
    status: nextStatus(),
    price: 1050,
    isPaid: false,
    notes: null,
    productType: "large_format_print",
    lines: [{
      productType: "large_format_print",
      largeFormatMaterialId: LF.bannerMatt.id,
      largeFormatLineData: lfLineData(LF.bannerMatt, 120, 240, 3, 1050),
      files: [{ fileName: "banner_radvan.pdf", fileUrl: "uploads/demo-lf-4.pdf", copies: 3, color: "color", paperType: "large_format" }],
    }],
  }));

  // ── 5. LF: Panza din bumbac — 60×90 см, 2 шт (preset) ──────────────────
  results.push(await createOrder({
    client: CLIENTS.vlad,
    status: nextStatus(),
    price: 1380,
    isPaid: true,
    notes: "Фото-портреты на холсте, с рамкой",
    productType: "large_format_print",
    lines: [{
      productType: "large_format_print",
      largeFormatMaterialId: LF.canvas.id,
      largeFormatLineData: {
        ...lfLineData(LF.canvas, 60, 90, 2, 1380),
        sizePresetSnapshot: { presetId: "preset-demo", widthCm: 60, heightCm: 90, unitPriceMdl: 690, customerType: "retail" },
      },
      files: [
        { fileName: "portrait_1.jpg", fileUrl: "uploads/demo-lf-5a.jpg", copies: 1, color: "color", paperType: "large_format" },
        { fileName: "portrait_2.jpg", fileUrl: "uploads/demo-lf-5b.jpg", copies: 1, color: "color", paperType: "large_format" },
      ],
    }],
  }));

  // ── 6. LF: PHOTO PAPER — 90×60 см, 4 шт (фотопечать) ──────────────────
  results.push(await createOrder({
    client: CLIENTS.ivan,
    status: nextStatus(),
    price: 720,
    isPaid: false,
    notes: "Фото-баннеры для кафе",
    productType: "large_format_print",
    lines: [{
      productType: "large_format_print",
      largeFormatMaterialId: LF.photo.id,
      largeFormatLineData: lfLineData(LF.photo, 90, 60, 4, 720),
      files: [{ fileName: "cafe_photos.zip", fileUrl: "uploads/demo-lf-6.pdf", copies: 4, color: "color", paperType: "large_format" }],
    }],
  }));

  // ── 7. Кружка жёлтая × 3 ────────────────────────────────────────────────
  results.push(await createOrder({
    client: CLIENTS.alina,
    status: nextStatus(),
    price: 450,
    isPaid: true,
    notes: "Корпоративный подарок, логотип компании",
    productType: "mug",
    lines: [{
      productType: "mug",
      mugProductId: MUGS.yellow.id,
      mugProductSnapshot: mugSnapshot(MUGS.yellow),
      files: [{ fileName: "logo_mug_yellow.png", fileUrl: "uploads/demo-mug-1.png", copies: 3, color: "color" }],
    }],
  }));

  // ── 8. Кружка синяя × 2 ─────────────────────────────────────────────────
  results.push(await createOrder({
    client: CLIENTS.alexei,
    status: nextStatus(),
    price: 300,
    isPaid: false,
    notes: null,
    productType: "mug",
    lines: [{
      productType: "mug",
      mugProductId: MUGS.blue.id,
      mugProductSnapshot: mugSnapshot(MUGS.blue),
      files: [{ fileName: "design_blue_mug.pdf", fileUrl: "uploads/demo-mug-2.pdf", copies: 2, color: "color" }],
    }],
  }));

  // ── 9. Кружки: синяя × 4 + зелёная × 4 (mixed mug lines) ───────────────
  results.push(await createOrder({
    client: CLIENTS.motinga,
    status: nextStatus(),
    price: 1200,
    isPaid: true,
    notes: "Разные цвета для команды, 2 дизайна",
    productType: "mug",
    lines: [
      {
        productType: "mug",
        mugProductId: MUGS.blue.id,
        mugProductSnapshot: mugSnapshot(MUGS.blue),
        files: [{ fileName: "team_design_A.png", fileUrl: "uploads/demo-mug-3a.png", copies: 4, color: "color" }],
      },
      {
        productType: "mug",
        mugProductId: MUGS.green.id,
        mugProductSnapshot: mugSnapshot(MUGS.green),
        files: [{ fileName: "team_design_B.png", fileUrl: "uploads/demo-mug-3b.png", copies: 4, color: "color" }],
      },
    ],
  }));

  // ── 10. Блокнот синий × 10 ───────────────────────────────────────────────
  results.push(await createOrder({
    client: CLIENTS.ion,
    status: nextStatus(),
    price: 1350,
    isPaid: true,
    notes: "Корп. блокноты, логотип на обложке",
    productType: "notebook",
    lines: [{
      productType: "notebook",
      notebookProductId: NOTEBOOKS.blue.id,
      notebookProductSnapshot: nbSnapshot(NOTEBOOKS.blue),
      files: [{ fileName: "cover_corp_blue.pdf", fileUrl: "uploads/demo-nb-1.pdf", copies: 10, color: "color" }],
    }],
  }));

  // ── 11. Блокнот чёрный × 5 ───────────────────────────────────────────────
  results.push(await createOrder({
    client: CLIENTS.vlad,
    status: nextStatus(),
    price: 675,
    isPaid: false,
    notes: "Блокноты для фотографа — персонализированные",
    productType: "notebook",
    lines: [{
      productType: "notebook",
      notebookProductId: NOTEBOOKS.black.id,
      notebookProductSnapshot: nbSnapshot(NOTEBOOKS.black),
      files: [{ fileName: "photo_notebook_cover.png", fileUrl: "uploads/demo-nb-2.png", copies: 5, color: "color" }],
    }],
  }));

  // ── 12. Блокнот зелёный × 3 + синий × 3 ────────────────────────────────
  results.push(await createOrder({
    client: CLIENTS.ivan,
    status: nextStatus(),
    price: 810,
    isPaid: false,
    notes: "2 варианта обложек",
    productType: "notebook",
    lines: [
      {
        productType: "notebook",
        notebookProductId: NOTEBOOKS.green.id,
        notebookProductSnapshot: nbSnapshot(NOTEBOOKS.green),
        files: [{ fileName: "cover_green_v1.pdf", fileUrl: "uploads/demo-nb-3a.pdf", copies: 3, color: "color" }],
      },
      {
        productType: "notebook",
        notebookProductId: NOTEBOOKS.blue.id,
        notebookProductSnapshot: nbSnapshot(NOTEBOOKS.blue),
        files: [{ fileName: "cover_blue_v1.pdf", fileUrl: "uploads/demo-nb-3b.pdf", copies: 3, color: "color" }],
      },
    ],
  }));

  // ── 13. Печать на бумаге: А3 листовки, 100 шт ───────────────────────────
  results.push(await createOrder({
    client: CLIENTS.alina,
    status: nextStatus(),
    price: 240,
    isPaid: true,
    notes: "Листовки для вечеринки, двусторонние",
    productType: "paper_print",
    lines: [{
      productType: "paper_print",
      files: [
        { fileName: "flyer_front.pdf", fileUrl: "uploads/demo-pp-1a.pdf", copies: 100, color: "color", paperType: "A3" },
        { fileName: "flyer_back.pdf",  fileUrl: "uploads/demo-pp-1b.pdf", copies: 100, color: "color", paperType: "A3" },
      ],
    }],
  }));

  // ── 14. Печать на бумаге: А4 ч/б, 50 шт ────────────────────────────────
  results.push(await createOrder({
    client: CLIENTS.alexei,
    status: nextStatus(),
    price: 75,
    isPaid: false,
    notes: null,
    productType: "paper_print",
    lines: [{
      productType: "paper_print",
      files: [{ fileName: "document_bw.pdf", fileUrl: "uploads/demo-pp-2.pdf", copies: 50, color: "bw", paperType: "A4", pageCount: 2 }],
    }],
  }));

  // ── 15. Mixed: LF баннер + кружка (подарочный набор к открытию) ─────────
  results.push(await createOrder({
    client: CLIENTS.motinga,
    status: nextStatus(),
    price: 780,
    isPaid: true,
    isPrio: true,
    notes: "Открытие кафе: баннер 80×150 + кружки с логотипом",
    productType: "mixed",
    lines: [
      {
        productType: "large_format_print",
        largeFormatMaterialId: LF.bannerMatt.id,
        largeFormatLineData: lfLineData(LF.bannerMatt, 80, 150, 1, 380),
        files: [{ fileName: "cafe_banner.pdf", fileUrl: "uploads/demo-mix-1a.pdf", copies: 1, color: "color", paperType: "large_format" }],
      },
      {
        productType: "mug",
        mugProductId: MUGS.yellow.id,
        mugProductSnapshot: mugSnapshot(MUGS.yellow),
        files: [{ fileName: "cafe_logo_mug.png", fileUrl: "uploads/demo-mix-1b.png", copies: 4, color: "color" }],
      },
    ],
  }));

  // ── 16. Mixed: LF холст + блокноты (выставка художника) ─────────────────
  results.push(await createOrder({
    client: CLIENTS.vlad,
    status: nextStatus(),
    price: 1100,
    isPaid: false,
    notes: "Выставка: репродукция на холсте + именные блокноты для гостей",
    productType: "mixed",
    lines: [
      {
        productType: "large_format_print",
        largeFormatMaterialId: LF.canvas.id,
        largeFormatLineData: lfLineData(LF.canvas, 80, 100, 1, 740),
        files: [{ fileName: "art_print_canvas.jpg", fileUrl: "uploads/demo-mix-2a.jpg", copies: 1, color: "color", paperType: "large_format" }],
      },
      {
        productType: "notebook",
        notebookProductId: NOTEBOOKS.black.id,
        notebookProductSnapshot: nbSnapshot(NOTEBOOKS.black),
        files: [{ fileName: "notebook_art_cover.pdf", fileUrl: "uploads/demo-mix-2b.pdf", copies: 5, color: "color" }],
      },
    ],
  }));

  console.log(`\nCreated ${results.length} orders:\n`);
  for (const o of results) {
    console.log(`  #${String(o.orderNumber).padStart(4, "0")}  ${o.productType.padEnd(20)}  ${o.status}  ${o.phone}`);
  }
  console.log("\nDone.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

import type { PenProduct } from "@prisma/client";

export type PenProductSnapshot = {
  sku: string;
  nameRo: string;
  nameRu: string;
  nameEn: string;
  bodyColorHex: string;
  clipColorHex: string;
  printWidthCm: number;
  printHeightCm: number;
  printDpi: number;
  has3dPreview: boolean;
  sellPrice: number | null;
  dealerPrice: number | null;
};

export function penProductToSnapshot(p: PenProduct): PenProductSnapshot {
  return {
    sku: p.sku,
    nameRo: p.nameRo,
    nameRu: p.nameRu,
    nameEn: p.nameEn,
    bodyColorHex: p.bodyColorHex,
    clipColorHex: p.clipColorHex,
    printWidthCm: Number(p.printWidthCm),
    printHeightCm: Number(p.printHeightCm),
    printDpi: p.printDpi,
    has3dPreview: p.has3dPreview,
    sellPrice: p.sellPrice ? Number(p.sellPrice) : null,
    dealerPrice: p.dealerPrice ? Number(p.dealerPrice) : null,
  };
}

export function otherPenProductSnapshot(): PenProductSnapshot {
  return {
    sku: "OTHER",
    nameRo: "Alt Pix",
    nameRu: "Другая ручка",
    nameEn: "Other Pen",
    bodyColorHex: "#1f1f1f",
    clipColorHex: "#c0c0c0",
    printWidthCm: 4.0,
    printHeightCm: 1.5,
    printDpi: 300,
    has3dPreview: false,
    sellPrice: null,
    dealerPrice: null,
  };
}

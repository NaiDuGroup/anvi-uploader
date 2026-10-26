import type { Prisma, PrismaClient } from "@prisma/client";
import { PrintMethodCode } from "@/lib/printMethods/methods";
import {
  printPresetCreateData,
  printPresetUpdateData,
  toPrintPresetJson,
  toPrintPresetOption,
} from "@/lib/printMethods/presetRows";
import type {
  PrintPresetInput,
  PrintPresetJson,
  PrintPresetOption,
  PrintPresetPatch,
} from "@/lib/printMethods/presets";
import {
  mergePrintMethodSettingsPatch,
  parsePrintMethodSettings,
  type PrintMethodSettingsMap,
} from "@/lib/printMethods/settings";
import type { PrintMethodCategoryJson, PrintMethodJson } from "@/lib/printMethods/dto";
import { prisma as defaultPrisma } from "@/lib/prisma";

type Db = PrismaClient | Prisma.TransactionClient;

/** Raised when a method or preset does not exist (routes answer 404). */
export class PrintMethodNotFoundError extends Error {
  constructor(what: "method" | "preset") {
    super(`print_${what}_not_found`);
    this.name = "PrintMethodNotFoundError";
  }
}

const PRESET_ORDER = [{ sortOrder: "asc" }, { label: "asc" }] satisfies Prisma.PrintPricePresetOrderByWithRelationInput[];

/** A method with its parsed settings; null when the row is missing. */
export async function loadPrintMethod<C extends PrintMethodCode>(
  code: C,
  db: Db = defaultPrisma,
): Promise<PrintMethodJson<C> | null> {
  const row = await db.printMethod.findUnique({ where: { code } });
  if (!row) return null;
  return {
    code,
    names: { ro: row.nameRo, ru: row.nameRu, en: row.nameEn },
    printerCode: row.printerCode,
    isActive: row.isActive,
    settings: parsePrintMethodSettings(code, row.settings),
  };
}

/** A method's settings (defaults when the row is missing or the JSON is partial). */
export async function loadPrintMethodSettings<C extends PrintMethodCode>(
  code: C,
  db: Db = defaultPrisma,
): Promise<PrintMethodSettingsMap[C]> {
  const row = await db.printMethod.findUnique({ where: { code }, select: { settings: true } });
  return parsePrintMethodSettings(code, row?.settings ?? {});
}

/** Validate a settings patch, merge it onto the stored settings and save. */
export async function savePrintMethodSettings<C extends PrintMethodCode>(
  code: C,
  patch: unknown,
  db: Db = defaultPrisma,
): Promise<PrintMethodSettingsMap[C]> {
  const row = await db.printMethod.findUnique({ where: { code }, select: { settings: true } });
  if (!row) throw new PrintMethodNotFoundError("method");
  const settings = mergePrintMethodSettingsPatch(code, parsePrintMethodSettings(code, row.settings), patch);
  await db.printMethod.update({
    where: { code },
    data: { settings: settings as unknown as Prisma.InputJsonValue },
  });
  return settings;
}

/** Stock categories marked for the method (`StockCategory.printMethods`), active ones first by sort order. */
export async function loadPrintMethodCategories(
  code: PrintMethodCode,
  db: Db = defaultPrisma,
): Promise<PrintMethodCategoryJson[]> {
  const rows = await db.stockCategory.findMany({
    where: { printMethods: { has: code } },
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { code: "asc" }],
    select: { code: true, nameRo: true, nameRu: true, nameEn: true, isActive: true },
  });
  return rows.map((r) => ({
    code: r.code,
    names: { ro: r.nameRo, ru: r.nameRu, en: r.nameEn },
    isActive: r.isActive,
  }));
}

/** A method's price list, all entries or active only. */
export async function loadPrintPresets(
  code: PrintMethodCode,
  activeOnly: boolean,
  db: Db = defaultPrisma,
): Promise<PrintPresetJson[]> {
  const rows = await db.printPricePreset.findMany({
    where: { methodCode: code, ...(activeOnly ? { isActive: true } : {}) },
    orderBy: PRESET_ORDER,
  });
  return rows.map(toPrintPresetJson);
}

/** Active price list entries in plain numbers (what pricing reads). */
export async function loadActivePrintPresetOptions(
  code: PrintMethodCode,
  db: Db = defaultPrisma,
): Promise<PrintPresetOption[]> {
  const rows = await db.printPricePreset.findMany({
    where: { methodCode: code, isActive: true },
    orderBy: PRESET_ORDER,
  });
  return rows.map(toPrintPresetOption);
}

export async function createPrintPreset(
  code: PrintMethodCode,
  input: PrintPresetInput,
  db: Db = defaultPrisma,
): Promise<{ id: string }> {
  const method = await db.printMethod.findUnique({ where: { code }, select: { code: true } });
  if (!method) throw new PrintMethodNotFoundError("method");
  return db.printPricePreset.create({ data: printPresetCreateData(code, input), select: { id: true } });
}

/** Update a preset of this method; a preset of another method counts as missing. */
export async function updatePrintPreset(
  code: PrintMethodCode,
  id: string,
  patch: PrintPresetPatch,
  db: Db = defaultPrisma,
): Promise<void> {
  const res = await db.printPricePreset.updateMany({
    where: { id, methodCode: code },
    data: printPresetUpdateData(patch),
  });
  if (res.count === 0) throw new PrintMethodNotFoundError("preset");
}

/** Orders keep their own snapshot of the preset, so removal is safe. */
export async function deletePrintPreset(code: PrintMethodCode, id: string, db: Db = defaultPrisma): Promise<void> {
  const res = await db.printPricePreset.deleteMany({ where: { id, methodCode: code } });
  if (res.count === 0) throw new PrintMethodNotFoundError("preset");
}

/**
 * Fills a notebook's 3D look (size, binding, strap, ribbon, pen, cork /
 * bamboo part, colours) and its print area from what we know about it:
 *
 * - Supplier catalog (Gor Factory): the three sizes, the colour HEX — or, when
 *   the catalog has none (Fruti), the colour sampled from the product photo.
 * - Supplier description: «spiral ring», «flexible rings», «elastic band»,
 *   «ball pen included», «cork», «bamboo detail», «imitation leather»…
 * - Our own names (ru / ro / en) for colour words and «A5» / «A6».
 *
 * The result is a suggestion: the admin checks the 3D preview and saves.
 * Browser-safe and pure (the API route supplies supplier facts).
 */
import { accentColor } from "@/lib/mug/mugAutofill";
import {
  NOTEBOOK_LOOK_DEFAULTS,
  NOTEBOOK_LOOK_PRESETS,
  notebookPrintableArea,
  parseNotebookLook,
  type NotebookLook,
} from "./notebookLook";

export type NotebookSupplierFacts = {
  /** The catalog's three sizes in cm, any order (cover sides + thickness). */
  sizesCm: number[];
  /** Catalog HEX «#F08927», or the colour sampled from the product photo. */
  colorHex: string | null;
  colorFromPhoto?: boolean;
  /** The product photo shows a spiral / ring binding (descriptions sometimes don't say). */
  photoSpiral?: boolean | null;
};

export type NotebookAutofillInput = {
  names: string[];
  descriptions?: string[];
  supplier?: NotebookSupplierFacts | null;
};

export type NotebookAutofillFields = NotebookLook & {
  coverColorHex: string;
  strapColorHex: string;
  bookmarkColorHex: string;
  /** Only when the cover size is known (supplier): the cover face to print on. */
  printWidthCm?: number;
  printHeightCm?: number;
};

export type NotebookAutofillNote =
  | "supplier_size"
  | "supplier_color"
  | "photo_color"
  | "name_color"
  | "no_color"
  | "print_area"
  | "sticky_notes";

export type NotebookAutofillResult = { fields: NotebookAutofillFields; notes: NotebookAutofillNote[] };

const BLACK_WIRE = "#2b2b2b";
const CORK_HEX = "#b98a5a";
const BAMBOO_HEX = "#d8b98c";

/** Words the mug palette lacks (Fruti, Coral, Renat names). */
const EXTRA_COLOR_WORDS: readonly [RegExp, string][] = [
  [/вишн|cherry|cireș/, "#8e2a32"],
  [/цитрус|citrus/, "#efe6c8"],
  [/оливк|olive|măslin/, "#d9c58f"],
  [/кофе|coffee|cafea/, "#4a3529"],
  [/миндал|almond|migdal/, "#d6bca4"],
  [/грейпфрут|grapefruit/, "#ece2e2"],
  [/фукси|fuchsia|fucsia/, "#eb1c60"],
  [/т[её]мно-син|navy|bleumarin/, "#1d2a4d"],
  [/серо-беж|бежев|beige|bej/, "#e6dfcc"],
];

function colorFromNames(text: string): string | null {
  let best: { at: number; hex: string } | null = null;
  for (const [re, hex] of EXTRA_COLOR_WORDS) {
    const m = re.exec(text);
    if (m && (best == null || m.index < best.at)) best = { at: m.index, hex };
  }
  return best?.hex ?? accentColor(text);
}

/** «#F3EFE0» → «#f3efe0»; two-tone «#FFFFFF/#000000» → the first. */
function normaliseHex(raw: string | null | undefined): string | null {
  const first = raw?.split("/")[0]?.trim() ?? "";
  return /^#[0-9a-f]{6}$/i.test(first) ? first.toLowerCase() : null;
}

/** Cover width / height / thickness from three sizes in any order (portrait cover). */
export function notebookSizeFromSupplier(sizesCm: number[]): { widthCm: number; heightCm: number; thicknessCm: number } | null {
  const s = sizesCm.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (s.length < 3) return null;
  return { thicknessCm: s[0]!, widthCm: s[1]!, heightCm: s[2]! };
}

export function autofillNotebook(input: NotebookAutofillInput): NotebookAutofillResult {
  const names = input.names.map((n) => n.toLowerCase()).join(" | ");
  const desc = (input.descriptions ?? []).map((d) => d.toLowerCase()).join(" | ");
  const text = `${names} | ${desc}`;
  const notes: NotebookAutofillNote[] = [];

  const spiral =
    /spiral|\brings?\b|пружин|спирал|кольц|spiră|spirală|inele|wire-o/.test(text) || input.supplier?.photoSpiral === true;
  const preset = (key: string) => NOTEBOOK_LOOK_PRESETS.find((p) => p.key === key)!.look;
  const small = /\ba6\b|а6/.test(text);
  const base: Partial<NotebookLook> = spiral ? preset("a5Spiral") : small ? preset("a6Hard") : preset("a5Hard");
  const look: NotebookLook = parseNotebookLook({ ...NOTEBOOK_LOOK_DEFAULTS, ...base });

  const size = input.supplier ? notebookSizeFromSupplier(input.supplier.sizesCm) : null;
  if (size) {
    Object.assign(look, size);
    notes.push("supplier_size");
  }

  if (!spiral) {
    // Hardcovers in our range all have the elastic and the ribbon (Iris too, though its text skips them).
    look.hasStrap = true;
    look.hasBookmark = true;
  }
  look.hasPen = /\bball ?pen\b|\bpen included\b|\bpen\b|ручк|\bpix\b/.test(text);

  if (/imitation leather|кожзам|искусственн\S* кож|piele|\bleather\b|\bpu\b/.test(text)) look.finish = "leather";
  else if (spiral || /cardboard|картон|carton|kraft|крафт/.test(text)) look.finish = "matte";

  if (/cork|пробк|plută/.test(text)) {
    look.accent = "bottom";
    look.accentTexture = "cork";
    look.accentColorHex = CORK_HEX;
    look.accentSharePct = 45;
  } else if (/bamboo|бамбук|bambus/.test(text)) {
    look.accent = "spine";
    look.accentTexture = "plain";
    look.accentColorHex = BAMBOO_HEX;
    look.accentSharePct = 12;
  } else {
    look.accent = "none";
  }

  // Cover colour: supplier HEX / photo, then names.
  const supplierHex = normaliseHex(input.supplier?.colorHex);
  const nameHex = colorFromNames(names);
  const cover = supplierHex ?? nameHex ?? "#1f1f1f";
  if (supplierHex) notes.push(input.supplier?.colorFromPhoto ? "photo_color" : "supplier_color");
  else if (nameHex) notes.push("name_color");
  else notes.push("no_color");

  // Plastic rings (Mistrol) come in the cover colour; metal spirals are black.
  look.wireColorHex = /flexible rings|plastic rings|пластиков\S* кольц|rpet/.test(text) && spiral ? cover : BLACK_WIRE;
  look.penColorHex = cover;

  if (/sticky notes|стикер|закладк\S* для заметок|notițe adezive/.test(text)) notes.push("sticky_notes");

  const fields: NotebookAutofillFields = {
    ...look,
    coverColorHex: cover,
    // The elastic and the ribbon match the cover on the supplier's notebooks.
    strapColorHex: cover,
    bookmarkColorHex: cover,
  };
  if (size) {
    const area = notebookPrintableArea(look);
    fields.printWidthCm = area.widthCm;
    fields.printHeightCm = area.heightCm;
    notes.push("print_area");
  }
  return { fields, notes };
}

/**
 * Parse a notebook print file name into its (best-effort) order number and
 * cover-colour metadata for the workshop-board batch layout tool.
 *
 * Studio admins usually indicate the cover colour in Romanian (e.g.
 * `8228-negru.png`, `8231 albastru.png`, `caiet_rosu_A5.jpg`), but we also
 * accept Russian and English synonyms so the tool stays useful when file names
 * come from other sources. Diacritics are stripped before matching so
 * `roșu` / `rosu` / `Roșu` all resolve to the same colour.
 *
 * The parser is intentionally permissive: it returns whatever it could detect
 * and never throws. Callers should treat every field as optional.
 */

/** Slug used in the combined output file name. Always latin, kebab-safe. */
export type NotebookColorSlug =
  | "negru"
  | "alb"
  | "rosu"
  | "albastru"
  | "verde"
  | "galben"
  | "maro"
  | "gri"
  | "roz"
  | "portocaliu"
  | "violet"
  | "bordo"
  | "unknown";

export interface NotebookColorLabel {
  ro: string;
  ru: string;
  en: string;
}

export interface NotebookColorInfo {
  slug: NotebookColorSlug;
  /** Approximate visual swatch used in the preview chip. */
  hex: string;
  label: NotebookColorLabel;
}

export interface ParsedNotebookFileName {
  /** First 3–6 digit run in the base name, when present. */
  orderNumber: number | null;
  color: NotebookColorInfo;
  /** Base file name with its extension stripped (for UI display). */
  baseName: string;
}

/**
 * Known colours. Order matters when two aliases overlap (longer first) —
 * `albastru` must be checked before `alb` so `albastru.png` doesn't hit `alb`.
 * The `aliases` list is matched against the diacritic-stripped, lowercased
 * base name via word-boundary regex to keep partial words (`albas`) out.
 */
interface ColorDefinition {
  slug: Exclude<NotebookColorSlug, "unknown">;
  hex: string;
  label: NotebookColorLabel;
  /** Diacritic-free aliases, lowercase. */
  aliases: readonly string[];
}

const COLOR_DEFINITIONS: readonly ColorDefinition[] = [
  {
    slug: "albastru",
    hex: "#1e3a8a",
    label: { ro: "albastru", ru: "синий", en: "blue" },
    aliases: ["albastru", "sinii", "sinij", "siniy", "sin", "blue", "blau"],
  },
  {
    slug: "portocaliu",
    hex: "#f97316",
    label: { ro: "portocaliu", ru: "оранжевый", en: "orange" },
    aliases: ["portocaliu", "oranjevii", "oranj", "orange"],
  },
  {
    slug: "bordo",
    hex: "#7f1d1d",
    label: { ro: "bordo", ru: "бордовый", en: "burgundy" },
    aliases: ["bordo", "bordeaux", "bordovii", "bordovyj", "burgundy", "wine"],
  },
  {
    slug: "violet",
    hex: "#7c3aed",
    label: { ro: "violet", ru: "фиолетовый", en: "purple" },
    aliases: ["violet", "mov", "fioletovii", "fioletovyj", "purple", "lila"],
  },
  {
    slug: "verde",
    hex: "#15803d",
    label: { ro: "verde", ru: "зелёный", en: "green" },
    aliases: ["verde", "zelenii", "zelenyj", "zelenyi", "zelen", "green", "grun"],
  },
  {
    slug: "galben",
    hex: "#eab308",
    label: { ro: "galben", ru: "жёлтый", en: "yellow" },
    aliases: ["galben", "jeltii", "zheltyj", "zheltyi", "yellow", "gelb"],
  },
  {
    slug: "negru",
    hex: "#111827",
    label: { ro: "negru", ru: "чёрный", en: "black" },
    aliases: ["negru", "cernii", "chernyj", "chernyi", "chorny", "black", "schwarz"],
  },
  {
    slug: "rosu",
    hex: "#dc2626",
    label: { ro: "roșu", ru: "красный", en: "red" },
    aliases: ["rosu", "rosii", "krasnii", "krasnyj", "krasnyi", "red", "rot"],
  },
  {
    slug: "maro",
    hex: "#78350f",
    label: { ro: "maro", ru: "коричневый", en: "brown" },
    aliases: ["maro", "korichnevii", "korichnevyj", "brown", "braun"],
  },
  {
    slug: "gri",
    hex: "#6b7280",
    label: { ro: "gri", ru: "серый", en: "gray" },
    aliases: ["gri", "serii", "seryj", "seryi", "gray", "grey", "grau"],
  },
  {
    slug: "roz",
    hex: "#ec4899",
    label: { ro: "roz", ru: "розовый", en: "pink" },
    aliases: ["roz", "rozovii", "rozovyj", "pink", "rosa"],
  },
  {
    /** Deliberately last: `alb` is a 3-letter prefix of many other words. */
    slug: "alb",
    hex: "#f8fafc",
    label: { ro: "alb", ru: "белый", en: "white" },
    aliases: ["alb", "belii", "belyj", "belyi", "white", "weiss"],
  },
] as const;

const UNKNOWN_COLOR: NotebookColorInfo = {
  slug: "unknown",
  hex: "#94a3b8",
  label: { ro: "necunoscut", ru: "не распознан", en: "unknown" },
};

/**
 * Strip diacritics (é, ș, ț, ă, î, â …) using NFD normalisation, then remove
 * combining marks. Falls back to the original string when `normalize` is
 * unavailable (very old runtimes) so we never lose data.
 */
function stripDiacritics(input: string): string {
  if (typeof input.normalize !== "function") return input;
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Base name without any file extension, or the input unchanged if none. */
function stripExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0) return fileName;
  return fileName.slice(0, lastDot);
}

/**
 * Normalise a base name for token matching: strip the extension and
 * diacritics, lower-case, and replace every non-alphanumeric run with a single
 * space so word boundaries are unambiguous.
 */
function normaliseForMatching(baseName: string): string {
  return stripDiacritics(baseName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Match the color whose earliest alias appears in the normalised token stream.
 * When two colors match, the earlier position wins so filename order dictates
 * detection (e.g. `rosu-not-albastru.png` → red). Ties are broken by the
 * longer alias so `albastru` beats `alb`.
 */
function detectColor(normalised: string): NotebookColorInfo {
  if (normalised.length === 0) return UNKNOWN_COLOR;

  let best: { def: ColorDefinition; index: number; length: number } | null = null;

  for (const def of COLOR_DEFINITIONS) {
    for (const alias of def.aliases) {
      // Word-boundary match against the normalised (single-space) stream.
      const pattern = new RegExp(`(^|\\s)${alias}(\\s|$)`);
      const match = pattern.exec(normalised);
      if (!match) continue;
      const index = match.index + match[1]!.length;
      const length = alias.length;
      if (
        best === null ||
        index < best.index ||
        (index === best.index && length > best.length)
      ) {
        best = { def, index, length };
      }
    }
  }

  if (!best) return UNKNOWN_COLOR;
  return { slug: best.def.slug, hex: best.def.hex, label: best.def.label };
}

/**
 * First 3–6 digit run in the base name (post-extension-strip). Longer runs
 * (7+ digits) are ignored — those look like timestamps, not order numbers.
 */
function detectOrderNumber(baseName: string): number | null {
  const match = /(?<!\d)(\d{3,6})(?!\d)/.exec(baseName);
  if (!match) return null;
  const value = Number.parseInt(match[1]!, 10);
  return Number.isFinite(value) ? value : null;
}

export function parseNotebookColorFromFileName(fileName: string): ParsedNotebookFileName {
  const baseName = stripExtension(fileName);
  const normalised = normaliseForMatching(baseName);
  return {
    orderNumber: detectOrderNumber(baseName),
    color: detectColor(normalised),
    baseName,
  };
}

/**
 * Build a file-name slot describing a single tile in the batch. Order-number
 * is prepended when detected so the operator recognises which physical
 * notebook goes into that slot. When neither is known we fall back to an
 * index-based placeholder to keep slots unambiguous.
 */
export function notebookBatchSlotSlug(
  parsed: ParsedNotebookFileName,
  indexFallback: number,
): string {
  const colorPart =
    parsed.color.slug === "unknown" ? `unknown-${indexFallback}` : parsed.color.slug;
  if (parsed.orderNumber !== null) {
    return `${parsed.orderNumber}-${colorPart}`;
  }
  return colorPart;
}

/** `YYYYMMDD` in the local time zone — used as a suffix on the output name. */
export function isoDateStampLocal(date: Date = new Date()): string {
  const y = date.getFullYear().toString().padStart(4, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}${m}${d}`;
}

/** Full output file name — `notebook-batch_<slot1>_..._<slotN>_<YYYYMMDD>.png`. */
export function buildNotebookBatchFileName(
  parsed: readonly ParsedNotebookFileName[],
  date: Date = new Date(),
): string {
  const slots = parsed.map((p, i) => notebookBatchSlotSlug(p, i + 1));
  return `notebook-batch_${slots.join("_")}_${isoDateStampLocal(date)}.png`;
}

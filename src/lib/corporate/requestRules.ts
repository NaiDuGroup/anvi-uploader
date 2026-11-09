import { z } from "zod";
import { checkCorporateFile } from "./fileTypes";
import { hasDotSegment } from "@/lib/uploads/keyPath";

/**
 * «Pentru companii» quote requests: the form's field rules, the status flow
 * and the honeypot. Pure (unit-tested); shared by the storefront form, the
 * public API and the staff admin.
 */

/** Products of interest (multi-select). Shop categories + print products + «other». */
export const CORPORATE_INTERESTS = [
  "notebooks",
  "mugs",
  "pens",
  "tshirts",
  "bags",
  "bottles",
  "gifts",
  "business_cards",
  "flyers",
  "banners",
  "stickers",
  "other",
] as const;
export type CorporateInterest = (typeof CORPORATE_INTERESTS)[number];

/** Quantity ranges, like Vistaprint's bulk form («How many do you need?»). */
export const CORPORATE_QUANTITIES = ["lt50", "50_100", "100_250", "250_500", "500_1000", "gt1000"] as const;
export type CorporateQuantity = (typeof CORPORATE_QUANTITIES)[number];

export const CORPORATE_STATUSES = ["new", "in_work", "offer_sent", "won", "lost"] as const;
export type CorporateStatus = (typeof CORPORATE_STATUSES)[number];

export function isCorporateStatus(v: unknown): v is CorporateStatus {
  return typeof v === "string" && (CORPORATE_STATUSES as readonly string[]).includes(v);
}

/** Honeypot input name: hidden from people, bots fill it. */
export const CORPORATE_HONEYPOT_FIELD = "website";

/** At most this many logo / brief files per request. */
export const CORPORATE_MAX_FILES = 5;
/** Deadline at most this far ahead (days). */
const MAX_DEADLINE_DAYS = 730;

const text = (max: number) => z.string().trim().max(max);

const fileSchema = z
  .object({
    fileKey: z
      .string()
      .min(1)
      .max(500)
      // Only fresh uploads (`/api/upload-url`, scope «corporate» / «order»).
      .refine((k) => k.startsWith("uploads/") && !hasDotSegment(k), "bad_key"),
    fileName: text(200).min(1),
    sizeBytes: z.number().int().nonnegative().optional(),
  })
  .superRefine((f, ctx) => {
    // Both the display name and the stored key must be an allowed type (the key ends with the uploaded name).
    for (const name of [f.fileName, f.fileKey]) {
      const check = checkCorporateFile({ name, size: f.sizeBytes });
      if (!check.ok) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: check.reason });
        return;
      }
    }
  });

/** The form body before checks that need «today» (deadline). */
export const corporateRequestSchema = z.object({
  companyName: text(200).min(2),
  contactName: text(120).min(2),
  phone: z
    .string()
    .trim()
    .max(40)
    .refine((p) => p.replace(/\D/g, "").length >= 8, "phone"),
  email: z.string().trim().toLowerCase().max(200).email(),
  products: z.array(z.enum(CORPORATE_INTERESTS)).min(1).max(CORPORATE_INTERESTS.length),
  productsOther: text(300).optional().default(""),
  quantity: z.enum(CORPORATE_QUANTITIES),
  /** YYYY-MM-DD. */
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  budget: text(120).optional().default(""),
  hasLogo: z.boolean(),
  files: z.array(fileSchema).max(CORPORATE_MAX_FILES).optional().default([]),
  message: text(3000).optional().default(""),
  consent: z.literal(true),
  lang: z.enum(["ro", "ru", "en"]).optional().default("ro"),
});

export type CorporateRequestInput = z.infer<typeof corporateRequestSchema>;

/** Field → error code; the form maps codes to texts. */
export type CorporateFieldErrors = Partial<Record<keyof CorporateRequestInput, string>>;

export type CorporateParseResult =
  | { ok: true; data: CorporateRequestInput & { deadlineDate: Date } }
  | { ok: false; errors: CorporateFieldErrors };

/** UTC midnight of a YYYY-MM-DD string; null when it is not a real date. */
export function parseDateOnly(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
    ? d
    : null;
}

/** Today's date (YYYY-MM-DD) in Chișinău. */
export function chisinauToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Chisinau" }).format(now);
}

/**
 * Validate a submitted form. `now` decides the earliest deadline (today in
 * Chișinău). «other» needs the free-text field.
 */
export function parseCorporateRequest(raw: unknown, now: Date = new Date()): CorporateParseResult {
  const r = corporateRequestSchema.safeParse(raw);
  const errors: CorporateFieldErrors = {};
  if (!r.success) {
    for (const issue of r.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !(field in errors)) {
        errors[field as keyof CorporateRequestInput] =
          field === "consent"
            ? "consent"
            : field === "files" && (issue.message === "file_type" || issue.message === "file_too_large")
              ? issue.message
              : "invalid";
      }
    }
    return { ok: false, errors };
  }
  const data = r.data;
  const deadlineDate = parseDateOnly(data.deadline);
  const today = parseDateOnly(chisinauToday(now))!;
  if (!deadlineDate || deadlineDate < today || deadlineDate.getTime() - today.getTime() > MAX_DEADLINE_DAYS * 86400000) {
    errors.deadline = "invalid";
  }
  if (data.products.includes("other") && !data.productsOther) errors.productsOther = "required";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, data: { ...data, deadlineDate: deadlineDate! } };
}

/** True when the hidden honeypot input was filled (a bot). */
export function isHoneypotFilled(raw: unknown): boolean {
  if (raw == null || typeof raw !== "object") return false;
  const v = (raw as Record<string, unknown>)[CORPORATE_HONEYPOT_FIELD];
  return typeof v === "string" ? v.trim() !== "" : v != null && v !== false;
}

/** Stored copy of a request file: no expiry prefix (`uploads/` is deleted after 7 days). */
export const CORPORATE_FILE_PREFIX = "corporate-requests/";

export function corporateFileKey(uploadKey: string): string {
  const k = uploadKey.replace(/^\//, "");
  return CORPORATE_FILE_PREFIX + (k.startsWith("uploads/") ? k.slice("uploads/".length) : k);
}

export interface CorporateStoredFile {
  key: string;
  name: string;
  size: number | null;
}

/** Stored `files` JSON → typed list (skips malformed entries). */
export function readCorporateFiles(raw: unknown): CorporateStoredFile[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((f) => {
    if (f == null || typeof f !== "object") return [];
    const o = f as Record<string, unknown>;
    if (typeof o.key !== "string" || typeof o.name !== "string") return [];
    return [{ key: o.key, name: o.name, size: typeof o.size === "number" ? o.size : null }];
  });
}

/** Staff update (PATCH) body. */
export const corporateUpdateSchema = z
  .object({
    status: z.enum(CORPORATE_STATUSES).optional(),
    assigneeId: z.string().uuid().nullable().optional(),
    notes: z.string().max(10000).nullable().optional(),
  })
  .strict()
  .refine((v) => v.status !== undefined || v.assigneeId !== undefined || v.notes !== undefined, "empty");

export type CorporateUpdate = z.infer<typeof corporateUpdateSchema>;

/** Russian labels for the Telegram alert and the admin fallback. */
export const CORPORATE_INTEREST_RU: Record<CorporateInterest, string> = {
  notebooks: "Блокноты",
  mugs: "Кружки",
  pens: "Ручки",
  tshirts: "Футболки и кепки",
  bags: "Сумки",
  bottles: "Бутылки",
  gifts: "Подарки",
  business_cards: "Визитки",
  flyers: "Флаеры и полиграфия",
  banners: "Баннеры и широкоформат",
  stickers: "Наклейки",
  other: "Другое",
};

export const CORPORATE_QUANTITY_LABEL: Record<CorporateQuantity, string> = {
  lt50: "< 50",
  "50_100": "50–100",
  "100_250": "100–250",
  "250_500": "250–500",
  "500_1000": "500–1000",
  gt1000: "1000+",
};

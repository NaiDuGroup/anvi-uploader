import { z } from "zod";
import { CORPORATE_HONEYPOT_FIELD, chisinauToday, corporateRequestSchema, isHoneypotFilled, parseDateOnly } from "@/lib/corporate/requestRules";
import { formatPrice } from "@/lib/storefront/format";
import type { ShopLang } from "@/lib/storefront/i18n";

/**
 * «Помощь дизайнера» / «We design it for you» (Studio v2, item 6): a short
 * request from a mug / pen product page or the Studio template gallery. It is
 * stored as an ordinary «Pentru companii» request (`corporate_requests`, admin
 * «Корпоративные заявки»), marked so staff see it is a design request:
 * company name {@link DESIGN_REQUEST_COMPANY}, products `mugs|pens` + `other`
 * with `productsOther` = «Помощь дизайнера · <slug> · <variant>» (the Telegram
 * alert prints it). Pure (unit-tested), client-safe.
 *
 * The price is not decided yet: `studioInfo.designerHelpPriceLei` in admin
 * Settings (empty = «we'll tell you the price»).
 */

export const DESIGN_REQUEST_KINDS = ["mug", "pen"] as const;
export type DesignRequestKind = (typeof DESIGN_REQUEST_KINDS)[number];

/** Shown as the «company» of the stored request: the staff list says what it is at a glance. */
export const DESIGN_REQUEST_COMPANY = "Помощь дизайнера";
/** Start of `productsOther` (and of the message) of a design request. */
export const DESIGN_REQUEST_MARKER = "Помощь дизайнера";

export const DESIGN_REQUEST_MAX_FILES = 5;

const text = (max: number) => z.string().trim().max(max);

export const designRequestSchema = z
  .object({
    name: text(120).min(2),
    /** Phone or e-mail: at least one. */
    phone: z
      .string()
      .trim()
      .max(40)
      .optional()
      .default("")
      .refine((p) => p === "" || p.replace(/\D/g, "").length >= 8, "phone"),
    email: z.union([z.literal(""), z.string().trim().toLowerCase().max(200).email()]).optional().default(""),
    message: text(3000).min(5),
    kind: z.enum(DESIGN_REQUEST_KINDS),
    /** Product page slug, or empty from the Studio gallery without a product. */
    slug: z
      .string()
      .trim()
      .max(120)
      .regex(/^[a-z0-9-]*$/)
      .optional()
      .default(""),
    variant: text(120).optional().default(""),
    /** Where the button was: product page or the Studio gallery. */
    source: z.enum(["product", "studio"]).optional().default("product"),
    // Same rules as the corporate form: fresh `uploads/` keys, allowed types.
    files: corporateRequestSchema.shape.files,
    consent: z.literal(true),
    lang: z.enum(["ro", "ru", "en"]).optional().default("ro"),
  })
  .superRefine((v, ctx) => {
    if (!v.phone && !v.email) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["phone"], message: "contact" });
    if (v.files.length > DESIGN_REQUEST_MAX_FILES) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["files"], message: "too_many" });
  });

export type DesignRequestInput = z.infer<typeof designRequestSchema>;
export type DesignRequestField = "name" | "phone" | "email" | "message" | "files" | "consent" | "kind" | "slug";
/** Field → error code (`invalid`, `contact`, `consent`, `file_type`, `file_too_large`). */
export type DesignRequestErrors = Partial<Record<DesignRequestField, string>>;

export type DesignRequestParse = { ok: true; data: DesignRequestInput } | { ok: false; errors: DesignRequestErrors };

export function parseDesignRequest(raw: unknown): DesignRequestParse {
  const r = designRequestSchema.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };
  const errors: DesignRequestErrors = {};
  for (const issue of r.error.issues) {
    const field = issue.path[0];
    if (typeof field !== "string" || field in errors) continue;
    const code =
      field === "consent"
        ? "consent"
        : issue.message === "contact" || issue.message === "file_type" || issue.message === "file_too_large"
          ? issue.message
          : "invalid";
    errors[field as DesignRequestField] = code;
  }
  return { ok: false, errors };
}

export { isHoneypotFilled as isDesignRequestSpam, CORPORATE_HONEYPOT_FIELD as DESIGN_REQUEST_HONEYPOT_FIELD };

/** `productsOther` of the stored request: «Помощь дизайнера · cana-x · Alb». */
export function designRequestTopic(d: Pick<DesignRequestInput, "kind" | "slug" | "variant" | "source">): string {
  const where = d.slug || (d.source === "studio" ? `Studio (${d.kind === "mug" ? "кружка" : "ручка"})` : d.kind);
  return [DESIGN_REQUEST_MARKER, where, d.variant].filter(Boolean).join(" · ").slice(0, 300);
}

/** True for a stored corporate request made by this form. */
export function isDesignRequest(r: { companyName?: string | null; productsOther?: string | null }): boolean {
  return r.companyName === DESIGN_REQUEST_COMPANY || (r.productsOther ?? "").startsWith(DESIGN_REQUEST_MARKER);
}

/**
 * The `corporate_requests` row of a design request (without files, ip, consent
 * time). The deadline column is required there: a design request has none, so
 * it is the request day (staff read the marker, not the date).
 */
export function designRequestToCorporate(d: DesignRequestInput, now: Date = new Date()) {
  const topic = designRequestTopic(d);
  return {
    companyName: DESIGN_REQUEST_COMPANY,
    contactName: d.name,
    phone: d.phone,
    email: d.email,
    products: [d.kind === "mug" ? "mugs" : "pens", "other"],
    productsOther: topic,
    quantity: "lt50",
    deadline: parseDateOnly(chisinauToday(now))!,
    budget: null,
    hasLogo: d.files.length > 0,
    message: `[${topic}]\n${d.message}`.slice(0, 3200),
    lang: d.lang,
  };
}

/** Admin setting (lei) → the price shown, null when not set. */
export function parseDesignerPrice(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v.replace(",", ".").trim()) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

const LABELS: Record<ShopLang, { none: string; from: string }> = {
  ro: { none: "Cere ajutorul unui designer — îți spunem prețul", from: "Ajutorul designerului — de la {price}" },
  ru: { none: "Помощь дизайнера — сообщим цену", from: "Помощь дизайнера — от {price}" },
  en: { none: "Request a designer — we'll tell you the price", from: "Designer help — from {price}" },
};

/** Button text: «from X lei» when the price is set in Settings, else «we'll tell you the price». */
export function designerHelpLabel(lang: ShopLang, priceLei: number | null | undefined): string {
  const price = parseDesignerPrice(priceLei);
  const l = LABELS[lang] ?? LABELS.ro;
  return price == null ? l.none : l.from.replace("{price}", formatPrice(price, lang));
}

/** Product category → design request kind (mugs, pens), null for others. */
export function designRequestKindOf(product: { category: string; simpleKind?: string | null }): DesignRequestKind | null {
  if (product.category === "cani") return "mug";
  if (product.category === "pixuri") return "pen";
  return null;
}

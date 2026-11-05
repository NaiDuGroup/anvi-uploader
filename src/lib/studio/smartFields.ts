import { z } from "zod";
import { qrPayload } from "./qr";
import {
  SMART_FIELD_KEYS,
  studioId,
  type SmartTextKey,
  type StudioDoc,
  type StudioImageLayer,
  type StudioImageSrc,
  type StudioLayer,
  type StudioQrLayer,
  type StudioSurface,
  type StudioTextLayer,
} from "./document";

/**
 * «Datele mele» / «Мои данные»: the customer's details, typed once, filled
 * into every template and product. Template texts are bound by key
 * (`bind: "name"`), so switching template keeps the text. Pure.
 *
 * Logo: an upload key (`uploads/…`) lives only 7 days, so the account keeps
 * the logo only when its key is durable (`shop-orders/…`, a file of a placed
 * order); otherwise the account stores no logo and the picture stays in this
 * browser (`localId`, IndexedDB) — see `accountStudioFields`.
 */

export const STUDIO_TEXT_FIELD_KEYS = ["name", "title", "company", "phone", "email", "site", "address"] as const satisfies readonly SmartTextKey[];
export const STUDIO_COLOR_FIELD_KEYS = ["brandColor1", "brandColor2", "brandColor3"] as const;
export type StudioColorFieldKey = (typeof STUDIO_COLOR_FIELD_KEYS)[number];

export type StudioFields = Partial<Record<SmartTextKey, string>> &
  Partial<Record<StudioColorFieldKey, string>> & { logo?: StudioImageSrc | null };

export const STUDIO_FIELD_MAX = 200;
const LOGO_KEY = /^(uploads|shop-orders)\/[^\\]+$/;

const text = z.string().trim().max(STUDIO_FIELD_MAX).optional();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/).optional();

export const studioFieldsSchema = z
  .object({
    name: text,
    title: text,
    company: text,
    phone: text,
    email: text,
    site: text,
    address: text,
    brandColor1: color,
    brandColor2: color,
    brandColor3: color,
    logo: z
      .object({
        key: z
          .string()
          .max(500)
          .regex(LOGO_KEY)
          .refine((k) => !k.includes(".."))
          .optional(),
        localId: z.string().max(80).optional(),
        naturalW: z.number().finite().min(1).max(100_000),
        naturalH: z.number().finite().min(1).max(100_000),
        mime: z.string().max(40).optional(),
      })
      .nullable()
      .optional(),
  })
  .strict();

/** Stored / received fields; empty object when malformed. */
export function parseStudioFields(v: unknown): StudioFields {
  const r = studioFieldsSchema.safeParse(v);
  return r.success ? cleanFields(r.data) : {};
}

/** Drop empty values. */
export function cleanFields(f: StudioFields): StudioFields {
  const out: StudioFields = {};
  for (const k of SMART_FIELD_KEYS) {
    if (k === "logo") continue;
    const v = f[k];
    if (typeof v === "string" && v.trim() !== "") out[k] = v.trim();
  }
  if (f.logo) out.logo = f.logo;
  return out;
}

/** What the account may keep: the logo only with a durable key (uploads expire in 7 days). */
export function accountStudioFields(f: StudioFields): StudioFields {
  const out: StudioFields = cleanFields(f);
  if (out.logo && !out.logo.key?.startsWith("shop-orders/")) delete out.logo;
  return out;
}

/** Fields of `b` win where set; the rest from `a`. */
export function mergeStudioFields(a: StudioFields, b: StudioFields): StudioFields {
  return cleanFields({ ...cleanFields(a), ...cleanFields(b) });
}

function mapLayers(doc: StudioDoc, fn: (l: StudioLayer) => StudioLayer): StudioDoc {
  return { ...doc, surfaces: doc.surfaces.map((s) => ({ ...s, layers: s.layers.map(fn) })) };
}

/**
 * Fill a document with the customer's fields: bound texts take the value
 * (an empty field keeps the template sample as a placeholder), the logo slot
 * takes the logo, brand-coloured shapes take the colour. Text box sizes are
 * not re-measured here (pure); the editor measures them after.
 */
export function applyStudioFields(doc: StudioDoc, fields: StudioFields): StudioDoc {
  const f: StudioFields = cleanFields(fields);
  return mapLayers(doc, (l) => {
    if (l.kind === "text" && l.bind && l.bind !== "logo" && !l.bind.startsWith("brandColor")) {
      const v: string | undefined = f[l.bind as SmartTextKey];
      if (v) return { ...l, text: v.slice(0, 400), placeholder: false };
      return l;
    }
    if (l.kind === "image" && l.bind === "logo" && f.logo) return { ...l, src: f.logo };
    if (l.kind === "shape" && l.bindColor && f[l.bindColor]) return { ...l, fill: f[l.bindColor]! };
    return l;
  });
}

/** The fields as the document shows them now (editing a bound text on the canvas updates «Datele mele»). */
export function fieldsFromDoc(doc: StudioDoc): StudioFields {
  const out: StudioFields = {};
  for (const s of doc.surfaces) {
    for (const l of s.layers) {
      if (l.kind === "text" && l.bind && !l.placeholder && l.text.trim()) {
        const k = l.bind as SmartTextKey;
        if (!out[k]) out[k] = l.text.trim();
      } else if (l.kind === "image" && l.bind === "logo" && l.src && !out.logo) {
        out.logo = l.src;
      } else if (l.kind === "shape" && l.bindColor && l.fill && !out[l.bindColor]) {
        out[l.bindColor] = l.fill;
      }
    }
  }
  return out;
}

const isFreeText = (l: StudioLayer): l is StudioTextLayer => l.kind === "text" && !l.bind;
const isPhotoSlot = (l: StudioLayer): l is StudioImageLayer => l.kind === "image" && l.bind !== "logo";
const isQr = (l: StudioLayer): l is StudioQrLayer => l.kind === "qr";
/** A QR code the customer filled in (something to encode). */
const hasQrData = (l: StudioQrLayer): boolean => qrPayload(l.qr.type, l.qr.data) !== "";

/**
 * Switch template, keeping what the customer made: bound values move by key,
 * free texts the customer typed go into the new template's free text boxes in
 * order, photos into its photo slots in order, filled-in QR codes (type and
 * data) into its QR spots in order (the spot keeps the template's place and
 * colours); whatever does not fit is added on top as it was. The document
 * keeps its id (autosave, cart line).
 */
export function carryOverTemplate(oldDoc: StudioDoc, newDoc: StudioDoc): StudioDoc {
  let doc: StudioDoc = applyStudioFields(newDoc, fieldsFromDoc(oldDoc));
  const oldSurface: StudioSurface = oldDoc.surfaces[0]!;
  const texts: StudioTextLayer[] = oldSurface.layers.filter(isFreeText).filter((l) => !l.placeholder && !l.hidden && l.text.trim());
  const photos: StudioImageLayer[] = oldSurface.layers.filter(isPhotoSlot).filter((l) => l.src && !l.hidden);
  const qrs: StudioQrLayer[] = oldSurface.layers.filter(isQr).filter((l) => !l.hidden && hasQrData(l));
  let ti = 0;
  let pi = 0;
  let qi = 0;
  doc = {
    ...doc,
    surfaces: doc.surfaces.map((s, si) => {
      if (si !== 0) return s;
      const layers: StudioLayer[] = s.layers.map((l) => {
        if (isFreeText(l) && ti < texts.length) {
          const from: StudioTextLayer = texts[ti++]!;
          return { ...l, text: from.text, placeholder: false };
        }
        if (isPhotoSlot(l) && !l.src && pi < photos.length) {
          const from: StudioImageLayer = photos[pi++]!;
          return { ...l, src: from.src, crop: { zoom: 1, ox: 0, oy: 0 } };
        }
        if (isQr(l) && qi < qrs.length) {
          const from: StudioQrLayer = qrs[qi++]!;
          return { ...l, qr: { type: from.qr.type, data: { ...from.qr.data } } };
        }
        return l;
      });
      const extra: StudioLayer[] = [
        ...photos.slice(pi).map((l) => ({ ...l, id: studioId() })),
        ...qrs.slice(qi).map((l) => ({ ...l, id: studioId() })),
        ...texts.slice(ti).map((l) => ({ ...l, id: studioId() })),
      ];
      return { ...s, layers: [...layers, ...extra] };
    }),
  };
  return { ...doc, id: oldDoc.id };
}

/** localStorage key of a guest's fields. */
export const STUDIO_FIELDS_STORAGE_KEY = "anvi_studio_fields";

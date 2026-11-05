import qrcode from "qrcode-generator";
import type { SmartTextKey, StudioQrLayer, StudioQrType } from "./document";

/**
 * QR codes for the Studio, generated in the browser (MIT `qrcode-generator`):
 * a link, a phone number, Wi-Fi access or a contact card (vCard 3.0). Pure.
 */

export interface QrMatrix {
  size: number;
  dark: boolean[];
}

function esc(v: string): string {
  // Wi-Fi / vCard reserved characters.
  return v.replace(/([\\;,:"])/g, "\\$1");
}

/** A web address with a scheme (`site.md` → `https://site.md`). */
export function normalizeUrl(raw: string): string {
  const s: string = raw.trim();
  if (!s) return "";
  return /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
}

/** Phone digits for `tel:` (keeps a leading +). */
export function normalizePhone(raw: string): string {
  const s: string = raw.trim();
  const plus: string = s.startsWith("+") ? "+" : "";
  return plus + s.replace(/[^\d]/g, "");
}

/** The text encoded in the QR for this type and data; "" when there is nothing to encode. */
export function qrPayload(type: StudioQrType, data: Readonly<Record<string, string>>): string {
  const g = (k: string) => (data[k] ?? "").trim();
  switch (type) {
    case "url":
      return normalizeUrl(g("url"));
    case "tel": {
      const p: string = normalizePhone(g("phone"));
      return p.replace("+", "").length >= 3 ? `tel:${p}` : "";
    }
    case "wifi": {
      const ssid: string = g("ssid");
      if (!ssid) return "";
      const sec: string = g("security") === "nopass" ? "nopass" : g("security") === "WEP" ? "WEP" : "WPA";
      const pass: string = sec === "nopass" ? "" : g("password");
      return `WIFI:T:${sec};S:${esc(ssid)};${pass ? `P:${esc(pass)};` : ""}${g("hidden") === "1" ? "H:true;" : ""};`;
    }
    case "vcard": {
      const name: string = g("name");
      const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0"];
      if (!name && !g("phone") && !g("email")) return "";
      const parts: string[] = name.split(/\s+/).filter(Boolean);
      const last: string = parts.length > 1 ? parts[parts.length - 1]! : "";
      const first: string = parts.length > 1 ? parts.slice(0, -1).join(" ") : (parts[0] ?? "");
      lines.push(`N:${esc(last)};${esc(first)};;;`);
      lines.push(`FN:${esc(name || g("company"))}`);
      if (g("company")) lines.push(`ORG:${esc(g("company"))}`);
      if (g("title")) lines.push(`TITLE:${esc(g("title"))}`);
      if (g("phone")) lines.push(`TEL;TYPE=CELL:${normalizePhone(g("phone"))}`);
      if (g("email")) lines.push(`EMAIL:${g("email")}`);
      if (g("site")) lines.push(`URL:${normalizeUrl(g("site"))}`);
      if (g("address")) lines.push(`ADR:;;${esc(g("address"))};;;;`);
      lines.push("END:VCARD");
      return lines.join("\r\n");
    }
  }
}

/** UTF-8 bytes as a one-byte-per-char string (the library encodes chars & 0xff). */
function utf8Binary(s: string): string {
  const bytes: Uint8Array = new TextEncoder().encode(s);
  let out = "";
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
}

const cache = new Map<string, QrMatrix | null>();

/** Module matrix of a payload (error correction M), cached; null when empty or too long. */
export function qrMatrix(payload: string): QrMatrix | null {
  if (!payload) return null;
  const hit = cache.get(payload);
  if (hit !== undefined) return hit;
  let m: QrMatrix | null = null;
  try {
    const q = qrcode(0, "M");
    q.addData(utf8Binary(payload), "Byte");
    q.make();
    const size: number = q.getModuleCount();
    const dark: boolean[] = new Array<boolean>(size * size);
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark[r * size + c] = q.isDark(r, c);
    m = { size, dark };
  } catch {
    m = null;
  }
  if (cache.size > 50) cache.clear();
  cache.set(payload, m);
  return m;
}

export function layerQrMatrix(layer: Pick<StudioQrLayer, "qr">): QrMatrix | null {
  return qrMatrix(qrPayload(layer.qr.type, layer.qr.data));
}

/** Quiet zone around the code, in modules. */
export const QR_QUIET_MODULES = 2;
/** Smallest module that phones scan reliably once printed (mm). */
export const QR_MIN_MODULE_MM = 0.4;

/** «Datele mele» keys each QR type takes (form key = field key). */
const QR_PREFILL_KEYS: Record<StudioQrType, readonly SmartTextKey[]> = {
  url: ["site"],
  tel: ["phone"],
  wifi: [],
  vcard: ["name", "title", "company", "phone", "email", "site", "address"],
};

/**
 * The QR form data with empty fields filled from «Datele mele» (the link takes
 * the site); what the customer already typed is kept.
 */
export function qrPrefill(
  type: StudioQrType,
  data: Readonly<Record<string, string>>,
  fields: Readonly<Partial<Record<SmartTextKey, string>>> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = { ...data };
  if (!fields) return out;
  for (const k of QR_PREFILL_KEYS[type]) {
    const formKey: string = type === "url" ? "url" : k;
    const v: string = (fields[k] ?? "").trim();
    if (v && !(out[formKey] ?? "").trim()) out[formKey] = v.slice(0, 300);
  }
  return out;
}

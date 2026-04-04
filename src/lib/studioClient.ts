import { normalizePhoneDigits } from "./phoneNormalize";

export function normalizedPhoneForDb(phone: string | null | undefined): string | null {
  const n = normalizePhoneDigits(phone ?? "");
  return n.length >= 8 ? n : null;
}

/** Phone + order `clientName`, aligned with admin order modals when a registry client is selected. */
export function orderContactFromStudioCustomer(c: {
  kind: string;
  phone: string | null;
  personName: string | null;
  companyName: string | null;
}): { phone: string; clientName: string | null } {
  if (c.kind === "LEGAL") {
    const phone = c.phone?.trim() ?? "";
    const co = c.companyName?.trim() ?? "";
    const rep = c.personName?.trim() ?? "";
    const nm =
      co && rep ? `${co} — ${rep}` : co || rep || "";
    return { phone, clientName: nm || null };
  }
  return {
    phone: c.phone?.trim() ?? "",
    clientName: c.personName?.trim() || null,
  };
}

export function clientPickerLabel(c: {
  kind: string;
  personName: string | null;
  companyName: string | null;
  phone: string | null;
}): string {
  if (c.kind === "LEGAL") {
    const co = c.companyName?.trim() || "";
    const rep = c.personName?.trim();
    const ph = c.phone?.trim();
    const parts = [co, rep, ph].filter(Boolean);
    return parts.join(" · ") || co || "?";
  }
  const name = c.personName?.trim() || "";
  const ph = c.phone?.trim() || "";
  if (name && ph) return `${name} · ${ph}`;
  return name || ph || "?";
}

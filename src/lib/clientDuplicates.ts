import { stripMoldovaPrefix } from "./phoneNormalize";

/**
 * Duplicate detection for the client registry («Клиенты»). Pure helpers, safe
 * for client components; the Prisma lookup lives in `clientDuplicatesServer.ts`.
 *
 * A client is a duplicate when another record has the same IDNO (legal entity)
 * or the same phone within the same kind (a person and their company often share
 * one number but are separate clients for invoices; two persons or two companies
 * with one number are duplicates).
 */

export type DuplicateClientField = "idno" | "phone";

/** What the 409 `duplicate_client` response carries about the existing record. */
export interface DuplicateClientInfo {
  id: string;
  kind: string;
  companyName: string | null;
  personName: string | null;
  phone: string | null;
  companyIdno: string | null;
  isDealer: boolean;
}

export interface DuplicateClientMatch {
  field: DuplicateClientField;
  existing: DuplicateClientInfo;
}

/** Shortest digit string we treat as an IDNO (Moldovan IDNO is 13 digits). */
const MIN_IDNO_DIGITS = 5;
/** Shortest local phone part we compare (same as `normalizedPhoneForDb`'s 8 digits minus a prefix). */
const MIN_PHONE_LOCAL_DIGITS = 6;

/** IDNO digits only («1024 600 059 715» → «1024600059715»); null when too short to compare. */
export function normalizeIdno(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= MIN_IDNO_DIGITS ? digits : null;
}

/**
 * Phone key for comparing: the local part without one leading 373 / 0, so
 * «+373 69 123 456» and «069123456» match. Input is `phoneNormalized` (digits).
 */
export function phoneMatchKey(phoneNormalized: string | null | undefined): string | null {
  const digits = (phoneNormalized ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const local = stripMoldovaPrefix(digits);
  return local.length >= MIN_PHONE_LOCAL_DIGITS ? local : null;
}

export interface DuplicateCandidate extends DuplicateClientInfo {
  phoneNormalized: string | null;
}

/**
 * First candidate that duplicates the given IDNO / phone. IDNO wins over phone
 * (it identifies a company exactly); `excludeId` skips the record being edited.
 */
export function pickDuplicateClient(
  candidates: readonly DuplicateCandidate[],
  input: {
    kind?: string | null;
    phoneNormalized?: string | null;
    companyIdno?: string | null;
    excludeId?: string | null;
  },
): DuplicateClientMatch | null {
  const idno = normalizeIdno(input.companyIdno);
  const phone = phoneMatchKey(input.phoneNormalized);
  const pool = candidates.filter((c) => c.id !== input.excludeId);
  const toInfo = (c: DuplicateCandidate): DuplicateClientInfo => ({
    id: c.id,
    kind: c.kind,
    companyName: c.companyName,
    personName: c.personName,
    phone: c.phone,
    companyIdno: c.companyIdno,
    isDealer: c.isDealer,
  });
  if (idno) {
    const hit = pool.find((c) => normalizeIdno(c.companyIdno) === idno);
    if (hit) return { field: "idno", existing: toInfo(hit) };
  }
  if (phone) {
    const hit = pool.find(
      (c) => (!input.kind || c.kind === input.kind) && phoneMatchKey(c.phoneNormalized) === phone,
    );
    if (hit) return { field: "phone", existing: toInfo(hit) };
  }
  return null;
}

/** Display name of the existing client for the «already exists» message. */
export function duplicateClientLabel(c: Pick<DuplicateClientInfo, "kind" | "companyName" | "personName" | "phone">): string {
  const co = c.companyName?.trim();
  const person = c.personName?.trim();
  if (c.kind === "LEGAL") return co || person || c.phone?.trim() || "?";
  return person || co || c.phone?.trim() || "?";
}

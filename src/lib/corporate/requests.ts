import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readLocalFile, saveLocalFile } from "@/lib/local-storage";
import { copyObject, isLocalObjectStorage } from "@/lib/r2";
import { normalizedPhoneForDb } from "@/lib/studioClient";
import {
  CORPORATE_STATUSES,
  corporateFileKey,
  corporateUpdateSchema,
  isHoneypotFilled,
  parseCorporateRequest,
  readCorporateFiles,
  type CorporateFieldErrors,
  type CorporateStatus,
  type CorporateStoredFile,
} from "./requestRules";

/**
 * «Pentru companii» requests: storing a submitted form, the staff list,
 * detail and updates. Route handlers do auth + rate limiting; see
 * `requestRules.ts` for the pure rules.
 */

export type SubmitResult =
  | { kind: "created"; id: string; number: number }
  /** Honeypot filled: the caller answers like a success, nothing is stored. */
  | { kind: "spam" }
  | { kind: "invalid"; errors: CorporateFieldErrors };

/** Copy an order-scope upload (expires after 7 days) to `corporate-requests/`; null when the upload is missing. */
async function keepUpload(uploadKey: string): Promise<string | null> {
  const dest = corporateFileKey(uploadKey);
  if (isLocalObjectStorage()) {
    const data = await readLocalFile(uploadKey);
    if (!data) return null;
    await saveLocalFile(dest, data);
    return dest;
  }
  return (await copyObject(uploadKey, dest)) ? dest : null;
}

export async function submitCorporateRequest(
  raw: unknown,
  ctx: { ip?: string | null; userAgent?: string | null; now?: Date },
): Promise<SubmitResult> {
  if (isHoneypotFilled(raw)) return { kind: "spam" };
  const parsed = parseCorporateRequest(raw, ctx.now);
  if (!parsed.ok) return { kind: "invalid", errors: parsed.errors };
  const d = parsed.data;

  const files: CorporateStoredFile[] = [];
  for (const f of d.files) {
    try {
      const key = await keepUpload(f.fileKey);
      if (key) files.push({ key, name: f.fileName, size: f.sizeBytes ?? null });
    } catch (e) {
      // A storage problem must not lose the request: staff can ask for the file.
      console.error("[corporate] file copy failed:", e);
    }
  }

  const row = await prisma.corporateRequest.create({
    data: {
      companyName: d.companyName,
      contactName: d.contactName,
      phone: d.phone,
      email: d.email,
      products: d.products,
      productsOther: d.productsOther || null,
      quantity: d.quantity,
      deadline: d.deadlineDate,
      budget: d.budget || null,
      hasLogo: d.hasLogo,
      files: files as unknown as Prisma.InputJsonValue,
      message: d.message || null,
      lang: d.lang,
      consentAt: ctx.now ?? new Date(),
      ip: ctx.ip?.slice(0, 64) ?? null,
      userAgent: ctx.userAgent?.slice(0, 300) ?? null,
    },
    select: { id: true, number: true },
  });
  return { kind: "created", id: row.id, number: row.number };
}

// ── Staff side ───────────────────────────────────────────────────────────────

export interface CorporateListFilters {
  status?: CorporateStatus | "open" | null;
  q?: string | null;
  assigneeId?: string | null;
  page?: number;
}

export const CORPORATE_PAGE_SIZE = 30;

export function corporateListWhere(f: CorporateListFilters): Prisma.CorporateRequestWhereInput {
  const and: Prisma.CorporateRequestWhereInput[] = [];
  if (f.status === "open") and.push({ status: { in: ["new", "in_work", "offer_sent"] } });
  else if (f.status && (CORPORATE_STATUSES as readonly string[]).includes(f.status)) and.push({ status: f.status });
  if (f.assigneeId === "none") and.push({ assigneeId: null });
  else if (f.assigneeId) and.push({ assigneeId: f.assigneeId });
  const q = f.q?.trim();
  if (q) {
    const num = /^\d{1,9}$/.test(q) ? Number(q) : null;
    const digits = normalizedPhoneForDb(q);
    and.push({
      OR: [
        ...(num != null ? [{ number: num }] : []),
        { companyName: { contains: q, mode: "insensitive" } },
        { contactName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        ...(digits && digits !== q ? [{ phone: { contains: digits } }] : []),
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

export interface CorporateListRow {
  id: string;
  number: number;
  status: string;
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  products: string[];
  quantity: string;
  deadline: string;
  assigneeId: string | null;
  fileCount: number;
  createdAt: string;
}

export async function listCorporateRequests(f: CorporateListFilters): Promise<{
  rows: CorporateListRow[];
  total: number;
  page: number;
  pageCount: number;
  counts: Record<CorporateStatus, number>;
}> {
  const where = corporateListWhere(f);
  const page = Math.max(1, Math.floor(f.page ?? 1));
  const [rows, total, grouped] = await Promise.all([
    prisma.corporateRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * CORPORATE_PAGE_SIZE,
      take: CORPORATE_PAGE_SIZE,
    }),
    prisma.corporateRequest.count({ where }),
    prisma.corporateRequest.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const counts = Object.fromEntries(CORPORATE_STATUSES.map((s) => [s, 0])) as Record<CorporateStatus, number>;
  for (const g of grouped) if (g.status in counts) counts[g.status as CorporateStatus] = g._count._all;
  return {
    rows: rows.map((r) => ({
      id: r.id,
      number: r.number,
      status: r.status,
      companyName: r.companyName,
      contactName: r.contactName,
      phone: r.phone,
      email: r.email,
      products: r.products,
      quantity: r.quantity,
      deadline: r.deadline.toISOString().slice(0, 10),
      assigneeId: r.assigneeId,
      fileCount: readCorporateFiles(r.files).length,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / CORPORATE_PAGE_SIZE)),
    counts,
  };
}

/** Requests nobody has taken yet (admin nav badge). */
export function countNewCorporateRequests(): Promise<number> {
  return prisma.corporateRequest.count({ where: { status: "new" } });
}

export interface CorporateDetail extends CorporateListRow {
  productsOther: string | null;
  budget: string | null;
  hasLogo: boolean;
  files: { name: string; size: number | null }[];
  message: string | null;
  lang: string;
  notes: string | null;
  statusChangedAt: string | null;
  updatedAt: string;
  /** Studio client with the same phone (prefills the order wizard), if any. */
  matchedClient: { id: string; name: string } | null;
}

export async function getCorporateRequest(id: string): Promise<CorporateDetail | null> {
  const r = await prisma.corporateRequest.findUnique({ where: { id } });
  if (!r) return null;
  const files = readCorporateFiles(r.files);
  const phoneNorm = normalizedPhoneForDb(r.phone);
  const client = await prisma.studioCustomer.findFirst({
    where: {
      OR: [
        ...(phoneNorm ? [{ phoneNormalized: phoneNorm }] : []),
        { email: { equals: r.email, mode: "insensitive" as const } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, companyName: true, personName: true },
  });
  return {
    id: r.id,
    number: r.number,
    status: r.status,
    companyName: r.companyName,
    contactName: r.contactName,
    phone: r.phone,
    email: r.email,
    products: r.products,
    quantity: r.quantity,
    deadline: r.deadline.toISOString().slice(0, 10),
    assigneeId: r.assigneeId,
    fileCount: files.length,
    createdAt: r.createdAt.toISOString(),
    productsOther: r.productsOther,
    budget: r.budget,
    hasLogo: r.hasLogo,
    files: files.map((f) => ({ name: f.name, size: f.size })),
    message: r.message,
    lang: r.lang,
    notes: r.notes,
    statusChangedAt: r.statusChangedAt?.toISOString() ?? null,
    updatedAt: r.updatedAt.toISOString(),
    matchedClient: client ? { id: client.id, name: client.companyName || client.personName || "" } : null,
  };
}

/** Stored file `index` of a request (download route). */
export async function corporateRequestFile(id: string, index: number): Promise<CorporateStoredFile | null> {
  const r = await prisma.corporateRequest.findUnique({ where: { id }, select: { files: true } });
  if (!r) return null;
  return readCorporateFiles(r.files)[index] ?? null;
}

export type UpdateResult =
  | { kind: "ok"; status: string; assigneeId: string | null; notes: string | null }
  | { kind: "not_found" }
  | { kind: "invalid" };

/** Staff change: status (stamps `statusChangedAt`), assignee (must be staff), notes. */
export async function updateCorporateRequest(id: string, raw: unknown): Promise<UpdateResult> {
  const p = corporateUpdateSchema.safeParse(raw);
  if (!p.success) return { kind: "invalid" };
  const u = p.data;
  const cur = await prisma.corporateRequest.findUnique({ where: { id }, select: { status: true } });
  if (!cur) return { kind: "not_found" };
  if (u.assigneeId) {
    const staff = await prisma.user.findUnique({ where: { id: u.assigneeId }, select: { role: true } });
    if (!staff || !["admin", "superadmin", "workshop"].includes(staff.role)) return { kind: "invalid" };
  }
  const data: Prisma.CorporateRequestUpdateInput = {};
  if (u.status !== undefined && u.status !== cur.status) {
    data.status = u.status;
    data.statusChangedAt = new Date();
  }
  if (u.assigneeId !== undefined) data.assigneeId = u.assigneeId;
  if (u.notes !== undefined) data.notes = u.notes?.trim() ? u.notes : null;
  const row = await prisma.corporateRequest.update({
    where: { id },
    data,
    select: { status: true, assigneeId: true, notes: true },
  });
  return { kind: "ok", ...row };
}

/** Staff users for the assignee picker. */
export async function listCorporateAssignees(): Promise<{ id: string; name: string }[]> {
  const users = await prisma.user.findMany({
    where: { role: { in: ["admin", "superadmin", "workshop"] } },
    select: { id: true, name: true, displayName: true },
    orderBy: { name: "asc" },
  });
  return users.map((u) => ({ id: u.id, name: u.displayName || u.name }));
}

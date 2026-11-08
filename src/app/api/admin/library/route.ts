import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseListPage } from "@/lib/listPagination";
import { requireLibraryStaff } from "@/lib/library/libraryAuth";
import {
  LIBRARY_CLIENT_SELECT,
  SAVE_TO_LIBRARY_ERROR_RU,
  librarySearchWhere,
  saveOrderFileToLibrary,
  serializeLibraryFile,
} from "@/lib/library/libraryService";
import { LIBRARY_TAGS_MAX, LIBRARY_TITLE_MAX } from "@/lib/library/libraryKeys";

export const runtime = "nodejs";
export const maxDuration = 60;

const ORDER_BY: Prisma.LibraryFileOrderByWithRelationInput[] = [
  { lastUsedAt: { sort: "desc", nulls: "last" } },
  { createdAt: "desc" },
  { id: "asc" },
];

/**
 * «Библиотека макетов» list.
 * - `search`: title / file name / tag / client name / phone;
 * - `owner`: `all` (default) · `common` · a client id;
 * - `archived=1`: only archived items;
 * - `forClient=<id>` (wizard picker): that client's items first, then common ones.
 */
export async function GET(request: NextRequest) {
  const { denied } = await requireLibraryStaff();
  if (denied) return denied;

  const sp = new URL(request.url).searchParams;
  const search = librarySearchWhere(sp.get("search") ?? "");
  const archived = sp.get("archived") === "1";
  const base: Prisma.LibraryFileWhereInput[] = [{ archivedAt: archived ? { not: null } : null }];
  if (search) base.push(search);

  const include = { client: { select: LIBRARY_CLIENT_SELECT } } as const;
  const sourceNumbers = async (rows: Array<{ sourceOrderId: string | null }>) => {
    const ids = [...new Set(rows.map((r) => r.sourceOrderId).filter((v): v is string => Boolean(v)))];
    if (ids.length === 0) return new Map<string, number>();
    const orders = await prisma.order.findMany({ where: { id: { in: ids } }, select: { id: true, orderNumber: true } });
    return new Map(orders.map((o) => [o.id, o.orderNumber]));
  };

  const forClient = sp.get("forClient");
  if (sp.has("forClient")) {
    // Picker: the order's client first, then common items (other clients' designs stay out).
    const [own, common] = await Promise.all([
      forClient
        ? prisma.libraryFile.findMany({ where: { AND: [...base, { clientId: forClient }] }, orderBy: ORDER_BY, take: 100, include })
        : Promise.resolve([]),
      prisma.libraryFile.findMany({ where: { AND: [...base, { clientId: null }] }, orderBy: ORDER_BY, take: 100, include }),
    ]);
    const rows = [...own, ...common];
    const nums = await sourceNumbers(rows);
    return NextResponse.json({
      items: rows.map((r) => serializeLibraryFile(r, r.sourceOrderId ? (nums.get(r.sourceOrderId) ?? null) : null)),
      total: rows.length,
    });
  }

  const owner = sp.get("owner") ?? "all";
  if (owner === "common") base.push({ clientId: null });
  else if (owner !== "all" && owner) base.push({ clientId: owner });

  const { page, take, skip } = parseListPage(sp, { defaultLimit: 48, maxLimit: 100 });
  const where: Prisma.LibraryFileWhereInput = { AND: base };
  const [rows, total] = await Promise.all([
    prisma.libraryFile.findMany({ where, orderBy: ORDER_BY, skip, take, include }),
    prisma.libraryFile.count({ where }),
  ]);
  const nums = await sourceNumbers(rows);
  return NextResponse.json({
    items: rows.map((r) => serializeLibraryFile(r, r.sourceOrderId ? (nums.get(r.sourceOrderId) ?? null) : null)),
    total,
    page,
    pageSize: take,
  });
}

const createSchema = z.object({
  fileId: z.string().uuid(),
  title: z.string().max(LIBRARY_TITLE_MAX * 2).optional(),
  tags: z.union([z.array(z.string().max(200)).max(LIBRARY_TAGS_MAX * 2), z.string().max(2000)]).optional(),
  /** Owner: a client id, or null for «Общий». */
  clientId: z.string().uuid().nullable(),
});

/** «В библиотеку»: copy one order file to the library (`library/…`, no expiry). */
export async function POST(request: NextRequest) {
  const { user, denied } = await requireLibraryStaff();
  if (denied) return denied;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Неверные данные" }, { status: 400 });

  try {
    const res = await saveOrderFileToLibrary({ ...parsed.data, actorId: user.id });
    if (!res.ok) {
      const status = res.error === "file_not_found" ? 404 : res.error === "source_missing" ? 410 : res.error === "already_in_library" ? 409 : 400;
      return NextResponse.json({ error: SAVE_TO_LIBRARY_ERROR_RU[res.error], code: res.error, item: res.item }, { status });
    }
    return NextResponse.json({ item: res.item }, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/library:", error);
    return NextResponse.json({ error: "Не удалось сохранить в библиотеку" }, { status: 500 });
  }
}

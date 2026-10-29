import type { Prisma, PrismaClient } from "@prisma/client";
import { missingImportDocuments } from "./constants";
import { readImportDocument } from "./importStorage";
import { ImportApiError } from "./importRoute";
import type { ImportsDictionary } from "@/lib/i18n/imports/types";

/** Archive names keep letters, digits and a few separators. */
function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").trim() || "file";
}

export interface ImportArchive {
  /** Top folder inside the ZIP and the base of its file name: «2026-07-14_4246976-OG». */
  root: string;
  entries: { name: string; data: Buffer }[];
}

/**
 * Every document of the import, one folder per document kind. Refused while a
 * required document is missing, so an incomplete set is never handed over.
 */
export async function loadImportArchive(
  db: PrismaClient | Prisma.TransactionClient,
  id: string,
  kinds: ImportsDictionary["docKinds"],
): Promise<ImportArchive> {
  const s = await db.importShipment.findUnique({
    where: { id },
    select: {
      supplierOrderNo: true,
      proformaNo: true,
      orderedAt: true,
      arrivedAt: true,
      documents: { orderBy: { createdAt: "asc" }, select: { kind: true, fileName: true, fileKey: true } },
    },
  });
  if (!s) throw new ImportApiError(404, "not_found");
  const missing = missingImportDocuments(s.documents.map((d) => d.kind));
  if (missing.length > 0) throw new ImportApiError(409, "import_documents_missing", { missing });

  // The date the imports table shows, so the file sorts and matches the list.
  const date: string | null = (s.orderedAt ?? s.arrivedAt)?.toISOString().slice(0, 10) ?? null;
  const root: string = safeName([date, s.supplierOrderNo ?? s.proformaNo ?? id.slice(0, 8)].filter(Boolean).join("_"));

  // Read everything first: a file that cannot be read fails the request
  // instead of handing over a ZIP with a hole in it.
  const used = new Set<string>();
  const entries: { name: string; data: Buffer }[] = [];
  for (const d of s.documents) {
    const data: Buffer | null = await readImportDocument(d.fileKey);
    if (!data) throw new ImportApiError(502, "file_missing", { fileName: d.fileName });
    const folder: string = safeName(kinds[d.kind as keyof typeof kinds] ?? d.kind);
    const base: string = `${root}/${folder}/${safeName(d.fileName)}`;
    const dot: number = base.lastIndexOf(".") > base.lastIndexOf("/") ? base.lastIndexOf(".") : base.length;
    let name: string = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, dot)} (${n})${base.slice(dot)}`;
    used.add(name.toLowerCase());
    entries.push({ name, data });
  }

  return { root, entries };
}

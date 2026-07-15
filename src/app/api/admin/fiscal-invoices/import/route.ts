import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import {
  importPortalGridInvoices,
  importPortalCsvInvoices,
  runPostIngestEnrichment,
} from "@/lib/efactura/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

function looksLikeGridHtml(text: string): boolean {
  return (
    text.includes("fm-dg-rows") ||
    text.includes("class='row'") ||
    text.includes('class="row"') ||
    /<tr[\s>]/i.test(text)
  );
}

/**
 * Imports fiscal invoices from the SFS portal (CSV or grid HTML). Folder
 * (sent / completed / archive) is irrelevant — all land in the issued pool;
 * SOAP sync owns rejected/cancelled status updates.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";
    let text = "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }
      text = await file.text();
    } else if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      text = typeof body?.html === "string" ? body.html : "";
    } else {
      text = await request.text();
    }

    text = text.replace(/^\uFEFF/, "").trim();
    if (!text) {
      return NextResponse.json({ error: "Empty payload" }, { status: 400 });
    }

    const result = looksLikeGridHtml(text)
      ? await importPortalGridInvoices(text)
      : await importPortalCsvInvoices(text);

    if (result.parsed === 0) {
      return NextResponse.json(
        { error: "No invoice rows found (unrecognized format)", result },
        { status: 422 },
      );
    }
    const enrichment = await runPostIngestEnrichment({ enrichLimit: 30 });
    return NextResponse.json({ result, enrichment });
  } catch (error) {
    console.error("POST /api/admin/fiscal-invoices/import:", error);
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

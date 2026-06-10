import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { readLocalFile } from "@/lib/local-storage";
import { isLocalObjectStorage } from "@/lib/r2";

export const runtime = "nodejs";

/** Local-dev download for PDFs stored under `layouts/` in `.local-uploads`. */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "workshop" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isLocalObjectStorage()) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const key = request.nextUrl.searchParams.get("key")?.trim() ?? "";
  if (!key.startsWith("layouts/") || key.includes("..")) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  const data = await readLocalFile(key);
  if (!data) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const fileName = key.split("/").pop() ?? "layout.pdf";
  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(fileName)}"`,
  );
  headers.set("Content-Length", String(data.byteLength));

  return new NextResponse(new Uint8Array(data), { status: 200, headers });
}

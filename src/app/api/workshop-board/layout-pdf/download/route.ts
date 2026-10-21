import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { readLocalFile } from "@/lib/local-storage";
import { isLocalObjectStorage } from "@/lib/r2";

export const runtime = "nodejs";

const CONTENT_TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  png: "image/png",
  zip: "application/zip",
};

/** Local-dev download for layouts (PDF / PNG / ZIP) stored under `layouts/` in `.local-uploads`. */
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

  const storedName = key.split("/").pop() ?? "layout.pdf";
  const fileName = request.nextUrl.searchParams.get("name")?.trim() || storedName;
  const headers = new Headers();
  const ext = storedName.split(".").pop()?.toLowerCase() ?? "";
  headers.set("Content-Type", CONTENT_TYPE_BY_EXTENSION[ext] ?? "application/pdf");
  headers.set(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(fileName)}"`,
  );
  headers.set("Content-Length", String(data.byteLength));

  return new NextResponse(new Uint8Array(data), { status: 200, headers });
}

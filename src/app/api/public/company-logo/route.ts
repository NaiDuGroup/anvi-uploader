import { NextRequest, NextResponse } from "next/server";
import { resolveCompanyLogoBuffer } from "@/lib/companyLogo";
import { DEFAULT_COMPANY_PROFILE } from "@/lib/invoice/companyProfile";
import { prisma } from "@/lib/prisma";

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

function guessMimeFromKeyOrPath(logoPath: string): string {
  const ext = logoPath.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? "image/png";
}

export async function GET(request: NextRequest) {
  const profile =
    (await prisma.companyProfile.findFirst({
      orderBy: { createdAt: "asc" },
    })) ??
    (await prisma.companyProfile.create({
      data: { ...DEFAULT_COMPANY_PROFILE },
    }));
  const raw = profile.logoPath?.trim();
  if (!raw) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (raw.startsWith("https://") || raw.startsWith("http://")) {
    return NextResponse.redirect(raw);
  }

  if (raw.startsWith("/")) {
    return NextResponse.redirect(new URL(raw, request.url));
  }

  const buf = await resolveCompanyLogoBuffer(raw);
  if (!buf) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const mime = guessMimeFromKeyOrPath(raw);
  const headers = new Headers({
    "Content-Type": mime,
    "Cache-Control": "public, max-age=3600",
    "Content-Length": String(buf.byteLength),
  });

  return new NextResponse(new Uint8Array(buf), { status: 200, headers });
}

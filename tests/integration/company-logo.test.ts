import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { baseUrl, login, TEST_ADMIN, TEST_SUPERADMIN } from "./helpers";

const shouldRun = Boolean(
  process.env.TEST_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL,
);

describe.skipIf(!shouldRun)("integration: company logo", () => {
  let superCookie: string;
  let adminCookie: string;
  let profileId: string;
  let originalLogoPath: string | null;

  beforeAll(async () => {
    const s = await login(TEST_SUPERADMIN.name, TEST_SUPERADMIN.password);
    superCookie = s.cookie;
    const a = await login(TEST_ADMIN.name, TEST_ADMIN.password);
    adminCookie = a.cookie;
  });

  beforeEach(async () => {
    const p = await prisma.companyProfile.findFirst({
      orderBy: { createdAt: "asc" },
    });
    if (!p) throw new Error("company profile missing");
    profileId = p.id;
    originalLogoPath = p.logoPath;
  });

  afterEach(async () => {
    await prisma.companyProfile.update({
      where: { id: profileId },
      data: { logoPath: originalLogoPath },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("GET /api/public/company-logo returns 404 when logoPath is null", async () => {
    await prisma.companyProfile.update({
      where: { id: profileId },
      data: { logoPath: null },
    });
    const res = await fetch(`${baseUrl()}/api/public/company-logo`);
    expect(res.status).toBe(404);
  });

  it("GET /api/public/company-logo redirects when logoPath is /logo.png", async () => {
    await prisma.companyProfile.update({
      where: { id: profileId },
      data: { logoPath: "/logo.png" },
    });
    const res = await fetch(`${baseUrl()}/api/public/company-logo`, {
      redirect: "manual",
    });
    expect([302, 307]).toContain(res.status);
    const loc = res.headers.get("location") ?? "";
    expect(loc.endsWith("/logo.png")).toBe(true);
  });

  it("POST /api/admin/company-logo/presign returns 401 without session", async () => {
    const res = await fetch(`${baseUrl()}/api/admin/company-logo/presign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: "a.png", contentType: "image/png" }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/admin/company-logo/presign returns 403 for admin", async () => {
    const res = await fetch(`${baseUrl()}/api/admin/company-logo/presign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookie,
      },
      body: JSON.stringify({ fileName: "a.png", contentType: "image/png" }),
    });
    expect(res.status).toBe(403);
  });

  it("POST /api/admin/company-logo/presign returns 200 for superadmin", async () => {
    const res = await fetch(`${baseUrl()}/api/admin/company-logo/presign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: superCookie,
      },
      body: JSON.stringify({ fileName: "a.png", contentType: "image/png" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { uploadUrl?: string; fileKey?: string };
    expect(typeof body.uploadUrl).toBe("string");
    expect(body.fileKey?.startsWith("company/logo/")).toBe(true);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({ getSessionUser: vi.fn(async (): Promise<unknown> => null) }));
vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/rateLimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rateLimit")>()),
  hitRateLimit: vi.fn(async () => ({ allowed: true, count: 1, limit: 20, retryAfterSec: 1 })),
}));
vi.mock("@/lib/turnstile/guard", () => ({ guardUploaderTurnstile: vi.fn(async () => null) }));
const r2 = vi.hoisted(() => ({ getPresignedUploadUrl: vi.fn(async () => "https://r2.example/put") }));
vi.mock("@/lib/r2", () => r2);

import { POST } from "./route";

const req = (body: unknown) =>
  new NextRequest("https://print.anvi.md/api/upload-url", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9" },
  });

afterEach(() => {
  vi.unstubAllEnvs();
  auth.getSessionUser.mockResolvedValue(null);
  r2.getPresignedUploadUrl.mockClear();
});

describe("POST /api/upload-url fileSize", () => {
  const noSize = { fileName: "a.pdf", contentType: "application/pdf" };

  it("guests must declare the size", async () => {
    const res = await POST(req(noSize));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "file_size_required" });
    const ok = await POST(req({ ...noSize, fileSize: 10 }));
    expect(ok.status).toBe(200);
    expect(r2.getPresignedUploadUrl).toHaveBeenCalledWith(expect.any(String), "application/pdf", "uploads", {
      contentLength: 10,
    });
  });

  it("staff may omit it", async () => {
    auth.getSessionUser.mockResolvedValue({ id: "u1", role: "admin" });
    expect((await POST(req(noSize))).status).toBe(200);
  });

  it("UPLOAD_SIGN_CONTENT_LENGTH=0 lifts the requirement and the signed length", async () => {
    vi.stubEnv("UPLOAD_SIGN_CONTENT_LENGTH", "0");
    expect((await POST(req(noSize))).status).toBe(200);
    await POST(req({ ...noSize, fileSize: 10 }));
    expect(r2.getPresignedUploadUrl).toHaveBeenLastCalledWith(expect.any(String), "application/pdf", "uploads", {
      contentLength: undefined,
    });
  });
});

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrintMethodCode } from "@/lib/printMethods/methods";
import { DEFAULT_UV_SETTINGS } from "@/lib/printMethods/uvSettings";
import { DEFAULT_SUBLIMATION_SETTINGS } from "@/lib/printMethods/sublimationSettings";

const auth = vi.hoisted(() => ({ user: null as { id: string; role: string } | null }));
vi.mock("@/lib/auth", () => ({ getSessionUser: vi.fn(async () => auth.user) }));

const db = vi.hoisted(() => ({
  loadPrintMethod: vi.fn(),
  loadPrintPresets: vi.fn(),
  loadPrintMethodCategories: vi.fn(),
  savePrintMethodSettings: vi.fn(),
  createPrintPreset: vi.fn(),
  updatePrintPreset: vi.fn(),
  deletePrintPreset: vi.fn(),
}));
vi.mock("@/lib/printMethods/printMethodsDb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/printMethods/printMethodsDb")>();
  return { ...actual, ...db };
});

import { PrintMethodNotFoundError } from "@/lib/printMethods/printMethodsDb";
import { mergePrintMethodSettingsPatch } from "@/lib/printMethods/settings";
import { GET, PATCH } from "./[code]/route";
import { POST } from "./[code]/presets/route";
import { DELETE, PATCH as PATCH_PRESET } from "./[code]/presets/[id]/route";

const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });
const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/admin/print-methods/uv", {
    method,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

const UV_METHOD = {
  code: "uv",
  names: { ro: "Imprimare UV", ru: "UV-печать", en: "UV print" },
  printerCode: "uv",
  isActive: true,
  settings: DEFAULT_UV_SETTINGS,
};

beforeEach(() => {
  auth.user = { id: "u1", role: "workshop" };
  for (const fn of Object.values(db)) fn.mockReset();
  db.savePrintMethodSettings.mockImplementation(async (code: PrintMethodCode.Uv, patch: unknown) =>
    mergePrintMethodSettingsPatch(code, DEFAULT_UV_SETTINGS, patch),
  );
});

describe("GET /api/admin/print-methods/[code]", () => {
  it("403 without a session", async () => {
    auth.user = null;
    expect((await GET(req("GET"), params({ code: "uv" }))).status).toBe(403);
  });

  it("404 for an unknown method code", async () => {
    const res = await GET(req("GET"), params({ code: "laser" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "print_method_not_found" });
  });

  it("studio admins can read the method with its whole price list", async () => {
    auth.user = { id: "u2", role: "admin" };
    db.loadPrintMethod.mockResolvedValue(UV_METHOD);
    db.loadPrintPresets.mockResolvedValue([]);
    db.loadPrintMethodCategories.mockResolvedValue([]);
    const res = await GET(req("GET"), params({ code: "uv" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ method: UV_METHOD, presets: [], categories: [] });
    expect(db.loadPrintPresets).toHaveBeenCalledWith("uv", false);
  });

  it("sublimation answers its norms and the categories marked «Сублимация»", async () => {
    const method = { ...UV_METHOD, code: "sublimation", printerCode: "subl", settings: DEFAULT_SUBLIMATION_SETTINGS };
    const categories = [{ code: "pillows", names: { ro: "Perne", ru: "Подушки", en: "Pillows" }, isActive: true }];
    db.loadPrintMethod.mockResolvedValue(method);
    db.loadPrintPresets.mockResolvedValue([]);
    db.loadPrintMethodCategories.mockResolvedValue(categories);
    const res = await GET(req("GET"), params({ code: "sublimation" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ method, presets: [], categories });
    expect(db.loadPrintMethodCategories).toHaveBeenCalledWith("sublimation");
  });

  it("404 when the method row is missing", async () => {
    db.loadPrintMethod.mockResolvedValue(null);
    db.loadPrintPresets.mockResolvedValue([]);
    expect((await GET(req("GET"), params({ code: "dtf" }))).status).toBe(404);
  });
});

describe("PATCH /api/admin/print-methods/[code] (settings)", () => {
  it("403 for studio admins (workshop / super admin only)", async () => {
    auth.user = { id: "u2", role: "admin" };
    expect((await PATCH(req("PATCH", { wastePct: 10 }), params({ code: "uv" }))).status).toBe(403);
  });

  it("merges a partial patch", async () => {
    const res = await PATCH(req("PATCH", { wastePct: 10 }), params({ code: "uv" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ settings: { ...DEFAULT_UV_SETTINGS, wastePct: 10 } });
  });

  it("sublimation merges norms per category", async () => {
    const current = { wastePct: 5, norms: { mugs: { paperSheets: 1, tapeCm: 30, inkMl: 0.5 } } };
    db.savePrintMethodSettings.mockImplementation(async (code: PrintMethodCode.Sublimation, patch: unknown) =>
      mergePrintMethodSettingsPatch(code, current, patch),
    );
    const res = await PATCH(
      req("PATCH", { norms: { pillows: { paperSheets: 2, tapeCm: 60, inkMl: 1.2 } } }),
      params({ code: "sublimation" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      settings: { wastePct: 5, norms: { ...current.norms, pillows: { paperSheets: 2, tapeCm: 60, inkMl: 1.2 } } },
    });
    const bad = await PATCH(req("PATCH", { norms: { pillows: { paperSheets: -1, tapeCm: 0, inkMl: 0 } } }), params({ code: "sublimation" }));
    expect(bad.status).toBe(400);
  });

  it("400 on an invalid value or broken JSON", async () => {
    const bad = await PATCH(req("PATCH", { wastePct: -1 }), params({ code: "uv" }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe("validation_failed");
    expect((await PATCH(req("PATCH", "{oops"), params({ code: "uv" }))).status).toBe(400);
  });
});

describe("POST /api/admin/print-methods/[code]/presets", () => {
  it("creates a preset for the method", async () => {
    db.createPrintPreset.mockResolvedValue({ id: "new-id" });
    const body = { label: "Ручка 5×1", widthCm: 5, heightCm: 1, retailPrice: 20, dealerPrice: null };
    const res = await POST(req("POST", body), params({ code: "dtf" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "new-id" });
    expect(db.createPrintPreset).toHaveBeenCalledWith("dtf", body);
  });

  it("400 on an invalid preset", async () => {
    const res = await POST(req("POST", { label: "", widthCm: 5, heightCm: 1, retailPrice: 20 }), params({ code: "dtf" }));
    expect(res.status).toBe(400);
    expect(db.createPrintPreset).not.toHaveBeenCalled();
  });

  it("404 for sublimation and UV: they have no format price list", async () => {
    const body = { label: "A4", widthCm: 21, heightCm: 30, retailPrice: 100 };
    for (const code of ["sublimation", "uv"]) {
      const res = await POST(req("POST", body), params({ code }));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "print_method_no_price_list" });
    }
    expect(db.createPrintPreset).not.toHaveBeenCalled();
  });

  it("404 when the method row is missing", async () => {
    db.createPrintPreset.mockRejectedValue(new PrintMethodNotFoundError("method"));
    const body = { label: "A6", widthCm: 10, heightCm: 15, retailPrice: 100 };
    expect((await POST(req("POST", body), params({ code: "dtf" }))).status).toBe(404);
  });
});

describe("PATCH / DELETE /api/admin/print-methods/[code]/presets/[id]", () => {
  it("updates within the method", async () => {
    const res = await PATCH_PRESET(req("PATCH", { retailPrice: 25 }), params({ code: "uv", id: "p1" }));
    expect(res.status).toBe(200);
    expect(db.updatePrintPreset).toHaveBeenCalledWith("uv", "p1", { retailPrice: 25 });
  });

  it("404 for a preset of another method", async () => {
    db.updatePrintPreset.mockRejectedValue(new PrintMethodNotFoundError("preset"));
    const res = await PATCH_PRESET(req("PATCH", { retailPrice: 25 }), params({ code: "dtf", id: "p1" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "print_preset_not_found" });
  });

  it("deletes; 403 for studio admins", async () => {
    expect((await DELETE(req("DELETE"), params({ code: "uv", id: "p1" }))).status).toBe(200);
    expect(db.deletePrintPreset).toHaveBeenCalledWith("uv", "p1");
    auth.user = { id: "u2", role: "admin" };
    expect((await DELETE(req("DELETE"), params({ code: "uv", id: "p1" }))).status).toBe(403);
  });
});

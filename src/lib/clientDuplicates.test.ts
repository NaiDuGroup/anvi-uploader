import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  duplicateClientLabel,
  normalizeIdno,
  phoneMatchKey,
  pickDuplicateClient,
  type DuplicateCandidate,
} from "./clientDuplicates";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({ studioCustomer: { findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { findDuplicateClient } from "./clientDuplicatesServer";

const lastory: DuplicateCandidate = {
  id: "c-lastory",
  kind: "LEGAL",
  companyName: "LASTORY BRAND S.R.L.",
  personName: "Ion",
  phone: "+373 69 123 456",
  phoneNormalized: "37369123456",
  companyIdno: "1024600059715",
  isDealer: false,
};
const person: DuplicateCandidate = {
  id: "c-person",
  kind: "INDIVIDUAL",
  companyName: null,
  personName: "Maria",
  phone: "078 000 111",
  phoneNormalized: "078000111",
  companyIdno: null,
  isDealer: false,
};

describe("normalizeIdno", () => {
  it("keeps digits only", () => {
    expect(normalizeIdno(" 1024 600-059 715 ")).toBe("1024600059715");
  });
  it("is null for empty / too short", () => {
    expect(normalizeIdno("")).toBeNull();
    expect(normalizeIdno(null)).toBeNull();
    expect(normalizeIdno("-")).toBeNull();
    expect(normalizeIdno("12")).toBeNull();
  });
});

describe("phoneMatchKey", () => {
  it("drops one 373 or 0 prefix", () => {
    expect(phoneMatchKey("37369123456")).toBe("69123456");
    expect(phoneMatchKey("069123456")).toBe("69123456");
    expect(phoneMatchKey("69123456")).toBe("69123456");
  });
  it("is null for empty / too short", () => {
    expect(phoneMatchKey(null)).toBeNull();
    expect(phoneMatchKey("0123")).toBeNull();
  });
});

describe("pickDuplicateClient", () => {
  const pool = [person, lastory];

  it("matches IDNO regardless of spacing", () => {
    const m = pickDuplicateClient(pool, { companyIdno: "1024 6000 5971 5" });
    expect(m?.field).toBe("idno");
    expect(m?.existing.id).toBe("c-lastory");
    expect(m?.existing).not.toHaveProperty("phoneNormalized");
  });

  it("matches phone across kinds and prefixes", () => {
    expect(pickDuplicateClient(pool, { phoneNormalized: "069123456" })).toMatchObject({
      field: "phone",
      existing: { id: "c-lastory" },
    });
    expect(pickDuplicateClient(pool, { phoneNormalized: "37378000111" })).toMatchObject({
      field: "phone",
      existing: { id: "c-person" },
    });
  });

  it("prefers IDNO over phone", () => {
    const m = pickDuplicateClient(pool, { phoneNormalized: "078000111", companyIdno: "1024600059715" });
    expect(m).toMatchObject({ field: "idno", existing: { id: "c-lastory" } });
  });

  it("skips the record being edited", () => {
    expect(
      pickDuplicateClient(pool, { companyIdno: "1024600059715", phoneNormalized: "37369123456", excludeId: "c-lastory" }),
    ).toBeNull();
  });

  it("returns null without a match or without input", () => {
    expect(pickDuplicateClient(pool, { companyIdno: "1003600000001", phoneNormalized: "060999888" })).toBeNull();
    expect(pickDuplicateClient(pool, {})).toBeNull();
  });
});

describe("duplicateClientLabel", () => {
  it("shows company for legal, person for individual", () => {
    expect(duplicateClientLabel(lastory)).toBe("LASTORY BRAND S.R.L.");
    expect(duplicateClientLabel(person)).toBe("Maria");
  });
});

describe("findDuplicateClient", () => {
  beforeEach(() => db.studioCustomer.findMany.mockReset());

  it("does not query without phone or IDNO", async () => {
    expect(await findDuplicateClient({ phoneNormalized: null, companyIdno: "  " })).toBeNull();
    expect(db.studioCustomer.findMany).not.toHaveBeenCalled();
  });

  it("queries IDNO holders + phone suffix, excluding self", async () => {
    db.studioCustomer.findMany.mockResolvedValue([lastory]);
    const m = await findDuplicateClient({
      phoneNormalized: "069123456",
      companyIdno: "1024600059715",
      excludeId: "c-new",
    });
    expect(m).toMatchObject({ field: "idno", existing: { id: "c-lastory" } });
    const arg = db.studioCustomer.findMany.mock.calls[0][0];
    expect(arg.where.OR).toEqual([
      { companyIdno: { not: null } },
      { phoneNormalized: { endsWith: "69123456" } },
    ]);
    expect(arg.where.NOT).toEqual({ id: "c-new" });
  });
});

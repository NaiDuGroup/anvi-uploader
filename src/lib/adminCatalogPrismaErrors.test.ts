import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  adminCatalogErrorMessageLooksLikeSchemaDrift,
  adminCatalogPatchPrismaResponse,
  validationErrorLooksLikeStaleClient,
  prismaKnownErrorDebugPayload,
} from "./adminCatalogPrismaErrors";

describe("prismaKnownErrorDebugPayload", () => {
  it("extracts code and message from object", () => {
    expect(
      prismaKnownErrorDebugPayload({ code: "P2002", message: "dup", meta: { x: 1 } }),
    ).toEqual({
      prismaCode: "P2002",
      prismaMessage: "dup",
      prismaMeta: { x: 1 },
    });
  });

  it("returns empty for non-object", () => {
    expect(prismaKnownErrorDebugPayload(null)).toEqual({});
  });
});

describe("adminCatalogErrorMessageLooksLikeSchemaDrift", () => {
  it("detects column missing patterns", () => {
    expect(
      adminCatalogErrorMessageLooksLikeSchemaDrift(
        new Error('The column "purchase_cost" does not exist'),
      ),
    ).toBe(true);
  });

  it("returns false for generic errors", () => {
    expect(adminCatalogErrorMessageLooksLikeSchemaDrift(new Error("timeout"))).toBe(
      false,
    );
    expect(adminCatalogErrorMessageLooksLikeSchemaDrift("string")).toBe(false);
  });
});

describe("validationErrorLooksLikeStaleClient", () => {
  it("flags unknown arg / field messages", () => {
    expect(validationErrorLooksLikeStaleClient("Unknown arg `foo`")).toBe(true);
    expect(validationErrorLooksLikeStaleClient("Unknown field purchaseCost")).toBe(
      true,
    );
  });

  it("returns false for unrelated validation text", () => {
    expect(validationErrorLooksLikeStaleClient("Invalid Decimal")).toBe(false);
  });
});

describe("adminCatalogPatchPrismaResponse", () => {
  it("returns null for unhandled errors", async () => {
    expect(adminCatalogPatchPrismaResponse(new Error("boom"))).toBeNull();
  });

  it("maps P2002 to 409 sku_taken", async () => {
    const res = adminCatalogPatchPrismaResponse(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(409);
    expect(await res!.json()).toEqual({ error: "sku_taken" });
  });

  it("maps P2022 to database_schema_outdated", async () => {
    const res = adminCatalogPatchPrismaResponse(
      new Prisma.PrismaClientKnownRequestError("col", {
        code: "P2022",
        clientVersion: "test",
      }),
    );
    expect(res!.status).toBe(503);
    const body = (await res!.json()) as { error: string };
    expect(body.error).toBe("database_schema_outdated");
  });

  it("maps stale validation error to prisma_client_stale", async () => {
    const res = adminCatalogPatchPrismaResponse(
      new Prisma.PrismaClientValidationError("Unknown argument `purchaseCost`", {
        clientVersion: "test",
      }),
    );
    expect(res!.status).toBe(503);
    const body = (await res!.json()) as { error: string };
    expect(body.error).toBe("prisma_client_stale");
  });

  it("maps non-stale validation error to prisma_validation_failed", async () => {
    const res = adminCatalogPatchPrismaResponse(
      new Prisma.PrismaClientValidationError("Invalid value for Decimal", {
        clientVersion: "test",
      }),
    );
    expect(res!.status).toBe(400);
    const body = (await res!.json()) as { error: string };
    expect(body.error).toBe("prisma_validation_failed");
  });

  it("maps schema drift heuristic on Error to 503", async () => {
    const res = adminCatalogPatchPrismaResponse(
      new Error('column "x" does not exist in results'),
    );
    expect(res!.status).toBe(503);
  });
});

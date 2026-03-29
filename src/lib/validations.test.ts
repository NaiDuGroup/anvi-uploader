import { describe, it, expect } from "vitest";
import {
  createOrderSchema,
  createAdminOrderSchema,
  updateOrderSchema,
  getClientVisibleStatus,
  ORDER_STATUSES,
} from "./validations";

const validFile = {
  fileName: "doc.pdf",
  fileUrl: "uploads/key-1",
  copies: 1,
  color: "bw" as const,
  paperType: "A4",
};

describe("createOrderSchema", () => {
  it("accepts minimal valid payload", () => {
    const parsed = createOrderSchema.parse({
      phone: "+37379123456",
      files: [validFile],
    });
    expect(parsed.phone).toBe("+37379123456");
    expect(parsed.files).toHaveLength(1);
  });

  it("rejects phone shorter than 8 chars", () => {
    expect(() =>
      createOrderSchema.parse({ phone: "+123456", files: [validFile] }),
    ).toThrow();
  });

  it("rejects empty files array", () => {
    expect(() =>
      createOrderSchema.parse({ phone: "+37379123456", files: [] }),
    ).toThrow();
  });

  it("rejects notes over 500 chars", () => {
    expect(() =>
      createOrderSchema.parse({
        phone: "+37379123456",
        notes: "x".repeat(501),
        files: [validFile],
      }),
    ).toThrow();
  });
});

describe("createAdminOrderSchema", () => {
  it("accepts optional clientName", () => {
    const parsed = createAdminOrderSchema.parse({
      phone: "+37379123456",
      clientName: "Ion",
      files: [validFile],
    });
    expect(parsed.clientName).toBe("Ion");
  });

  it("rejects clientName over 100 chars", () => {
    expect(() =>
      createAdminOrderSchema.parse({
        phone: "+37379123456",
        clientName: "x".repeat(101),
        files: [validFile],
      }),
    ).toThrow();
  });
});

describe("updateOrderSchema", () => {
  it("accepts each known status", () => {
    for (const status of ORDER_STATUSES) {
      const parsed = updateOrderSchema.parse({ status });
      expect(parsed.status).toBe(status);
    }
  });

  it("rejects unknown status", () => {
    expect(() =>
      updateOrderSchema.parse({ status: "UNKNOWN_STATUS" }),
    ).toThrow();
  });

  it("accepts nullable clientName", () => {
    const parsed = updateOrderSchema.parse({ clientName: null });
    expect(parsed.clientName).toBeNull();
  });
});

describe("getClientVisibleStatus", () => {
  it("maps DELIVERED to ready", () => {
    expect(getClientVisibleStatus("DELIVERED")).toBe("ready");
  });

  it("maps ISSUE to issue", () => {
    expect(getClientVisibleStatus("ISSUE")).toBe("issue");
  });

  it("maps other internal statuses to inProgress", () => {
    const internal = [
      "NEW",
      "IN_PROGRESS",
      "SENT_TO_WORKSHOP",
      "WORKSHOP_PRINTING",
      "WORKSHOP_READY",
      "RETURNED_TO_STUDIO",
    ] as const;
    for (const s of internal) {
      expect(getClientVisibleStatus(s)).toBe("inProgress");
    }
  });
});

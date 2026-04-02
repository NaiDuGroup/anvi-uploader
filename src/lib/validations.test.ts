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

  it("accepts removeFileIds array of UUIDs", () => {
    const id1 = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    const id2 = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
    const parsed = updateOrderSchema.parse({ removeFileIds: [id1, id2] });
    expect(parsed.removeFileIds).toEqual([id1, id2]);
  });

  it("rejects removeFileIds with non-UUID strings", () => {
    expect(() =>
      updateOrderSchema.parse({ removeFileIds: ["not-a-uuid"] }),
    ).toThrow();
  });

  it("accepts empty removeFileIds array", () => {
    const parsed = updateOrderSchema.parse({ removeFileIds: [] });
    expect(parsed.removeFileIds).toEqual([]);
  });

  it("accepts addFiles array with valid file entries", () => {
    const parsed = updateOrderSchema.parse({
      addFiles: [
        { fileName: "new.pdf", fileUrl: "uploads/new-key", copies: 3, color: "color", paperType: "A3" },
      ],
    });
    expect(parsed.addFiles).toHaveLength(1);
    expect(parsed.addFiles![0].copies).toBe(3);
    expect(parsed.addFiles![0].color).toBe("color");
  });

  it("rejects addFiles entry with missing fileName", () => {
    expect(() =>
      updateOrderSchema.parse({
        addFiles: [{ fileUrl: "key", copies: 1, color: "bw" }],
      }),
    ).toThrow();
  });

  it("rejects addFiles entry with copies < 1", () => {
    expect(() =>
      updateOrderSchema.parse({
        addFiles: [{ fileName: "f.pdf", fileUrl: "key", copies: 0, color: "bw" }],
      }),
    ).toThrow();
  });

  it("accepts updateFiles array with valid entries", () => {
    const id = "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33";
    const parsed = updateOrderSchema.parse({
      updateFiles: [{ id, copies: 5, color: "color", paperType: "A0" }],
    });
    expect(parsed.updateFiles).toHaveLength(1);
    expect(parsed.updateFiles![0].copies).toBe(5);
  });

  it("accepts updateFiles with partial fields", () => {
    const id = "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33";
    const parsed = updateOrderSchema.parse({
      updateFiles: [{ id, color: "bw" }],
    });
    expect(parsed.updateFiles![0].copies).toBeUndefined();
    expect(parsed.updateFiles![0].color).toBe("bw");
  });

  it("rejects updateFiles with non-UUID id", () => {
    expect(() =>
      updateOrderSchema.parse({
        updateFiles: [{ id: "bad-id", copies: 1 }],
      }),
    ).toThrow();
  });

  it("accepts combined field + file operations", () => {
    const parsed = updateOrderSchema.parse({
      phone: "+37379000000",
      price: 200,
      removeFileIds: ["a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"],
      addFiles: [{ fileName: "x.pdf", fileUrl: "uploads/x", copies: 1, color: "bw" }],
      updateFiles: [{ id: "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33", copies: 10 }],
    });
    expect(parsed.phone).toBe("+37379000000");
    expect(parsed.removeFileIds).toHaveLength(1);
    expect(parsed.addFiles).toHaveLength(1);
    expect(parsed.updateFiles).toHaveLength(1);
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

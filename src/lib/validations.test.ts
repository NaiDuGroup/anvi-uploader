import { describe, it, expect } from "vitest";
import {
  createOrderSchema,
  createAdminOrderSchema,
  updateAdminOrderSchema,
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

  it("requires mugProductId when productType is mug", () => {
    expect(() =>
      createOrderSchema.parse({
        phone: "+37379123456",
        productType: "mug",
        files: [validFile],
      }),
    ).toThrow();
  });

  it("allows mug orders with mugOther instead of mugProductId", () => {
    const parsed = createOrderSchema.parse({
      phone: "+37379123456",
      productType: "mug",
      mugOther: true,
      files: [validFile],
    });
    expect(parsed.mugOther).toBe(true);
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

const minimalMugLayout = {
  templateId: "text_photo",
  text: "",
  fontFamily: "Roboto",
  textColor: "#000000",
  backgroundColor: "transparent",
  photoUrls: [] as string[],
  photoSettings: [] as Array<{
    fitMode: "cover" | "contain";
    alignment: "left" | "center" | "right";
  }>,
};

const UUID_MUG = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const UUID_FILE = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";

describe("updateAdminOrderSchema", () => {
  it("accepts minimal paper line with new file", () => {
    const parsed = updateAdminOrderSchema.parse({
      phone: "+37379123456",
      lines: [
        {
          productType: "paper_print",
          files: [validFile],
        },
      ],
    });
    expect(parsed.lines).toHaveLength(1);
    expect(parsed.lines[0].productType).toBe("paper_print");
  });

  it("accepts nullable clientId", () => {
    const parsed = updateAdminOrderSchema.parse({
      phone: "+37379123456",
      clientId: null,
      lines: [
        {
          productType: "paper_print",
          files: [validFile],
        },
      ],
    });
    expect(parsed.clientId).toBeNull();
  });

  it("accepts mug line with mugProductId and layout", () => {
    const parsed = updateAdminOrderSchema.parse({
      phone: "+37379123456",
      lines: [
        {
          productType: "mug",
          mugProductId: UUID_MUG,
          mugLayoutData: minimalMugLayout,
          files: [
            {
              fileName: "m.png",
              fileUrl: "uploads/m",
              copies: 2,
              color: "color" as const,
            },
          ],
        },
      ],
    });
    expect(parsed.lines[0].mugProductId).toBe(UUID_MUG);
  });

  it("accepts existing file patch by fileId", () => {
    const parsed = updateAdminOrderSchema.parse({
      phone: "+37379123456",
      lines: [
        {
          productType: "paper_print",
          files: [{ fileId: UUID_FILE, copies: 3 }],
        },
      ],
    });
    expect(parsed.lines[0].files[0]).toMatchObject({
      fileId: UUID_FILE,
      copies: 3,
    });
  });

  it("rejects empty lines", () => {
    expect(() =>
      updateAdminOrderSchema.parse({
        phone: "+37379123456",
        lines: [],
      }),
    ).toThrow();
  });

  it("rejects mug without product and without mugOther", () => {
    expect(() =>
      updateAdminOrderSchema.parse({
        phone: "+37379123456",
        lines: [
          {
            productType: "mug",
            files: [validFile],
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects short phone", () => {
    expect(() =>
      updateAdminOrderSchema.parse({
        phone: "+123",
        lines: [
          {
            productType: "paper_print",
            files: [validFile],
          },
        ],
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
      // `Order.price` is `Decimal(12, 2)?` since the
      // `decimal_order_prices` migration. The schema accepts whole-lei
      // integers (legacy values) and 2-decimal bani values alike.
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

  it("accepts decimal MDL prices with bani precision", () => {
    // 2-decimal place is the maximum precision we allow; this is the
    // primary motivation for the `decimal_order_prices` migration.
    const parsed = updateOrderSchema.parse({
      price: 1.5,
    });
    expect(parsed.price).toBe(1.5);

    const parsed2 = updateOrderSchema.parse({ price: 100.99 });
    expect(parsed2.price).toBe(100.99);
  });

  it("rejects prices with more than 2 decimal places", () => {
    expect(() => updateOrderSchema.parse({ price: 1.234 })).toThrow();
  });

  it("rejects negative prices", () => {
    expect(() => updateOrderSchema.parse({ price: -1 })).toThrow();
  });
});

describe("getClientVisibleStatus", () => {
  it("maps DELIVERED to ready", () => {
    expect(getClientVisibleStatus("DELIVERED")).toBe("ready");
  });

  it("maps ISSUE to issue", () => {
    expect(getClientVisibleStatus("ISSUE")).toBe("issue");
  });

  it("maps studio-ready statuses to readyInStudio", () => {
    const readyForPickup = ["READY_IN_STUDIO", "RETURNED_TO_STUDIO"] as const;
    for (const s of readyForPickup) {
      expect(getClientVisibleStatus(s)).toBe("readyInStudio");
    }
  });

  it("maps WORKSHOP_READY to readyInWorkshop", () => {
    expect(getClientVisibleStatus("WORKSHOP_READY")).toBe("readyInWorkshop");
  });

  it("maps other internal statuses to inProgress", () => {
    const internal = [
      "NEW",
      "IN_PROGRESS",
      "SENT_TO_WORKSHOP",
      "WORKSHOP_PRINTING",
    ] as const;
    for (const s of internal) {
      expect(getClientVisibleStatus(s)).toBe("inProgress");
    }
  });
});

describe("flyer lines", () => {
  const flyerLine = {
    productType: "flyer" as const,
    sheetPaperId: "11111111-1111-4111-8111-111111111111",
    quantity: 40,
    cardSides: "one" as const,
    cardPresetId: "flyer_a6" as const,
    files: [{ ...validFile, paperType: "business_card_front" }],
  };

  it("accepts a flyer line with a flyer preset", () => {
    const parsed = createOrderSchema.parse({ lines: [flyerLine] });
    expect(parsed.lines?.[0]?.productType).toBe("flyer");
  });

  it("accepts a flyer run above the business-card cap", () => {
    expect(() =>
      createOrderSchema.parse({ lines: [{ ...flyerLine, quantity: 8000 }] }),
    ).not.toThrow();
  });

  it("rejects a business-card preset on a flyer line", () => {
    expect(() =>
      createOrderSchema.parse({
        lines: [{ ...flyerLine, cardPresetId: "trim_90x50" }],
      }),
    ).toThrow(/bc_preset_unknown/);
  });

  it("rejects a flyer without paper", () => {
    expect(() =>
      createOrderSchema.parse({
        lines: [{ ...flyerLine, sheetPaperId: undefined }],
      }),
    ).toThrow(/bc_paper_required/);
  });
});

describe("UV print lines", () => {
  const uvFile = { ...validFile, color: "color" as const, paperType: "uv:z1" };
  const uv = {
    source: "client" as const,
    clientItem: { description: "бутылка 0,5 л" },
    quantity: 3,
    zones: [{ id: "z1", placement: "front" as const, widthCm: 8, heightCm: 5, whiteLayers: 1, varnish: true }],
  };

  it("admin create accepts a UV line with its details and rejects one without", () => {
    const parsed = createAdminOrderSchema.parse({
      phone: "+37379123456",
      lines: [{ productType: "uv_print", customerType: "dealer", uv, files: [uvFile] }],
    });
    expect(parsed.lines?.[0]?.uv?.zones[0]).toMatchObject({ whiteLayers: 1, varnish: true });
    const res = createAdminOrderSchema.safeParse({
      phone: "+37379123456",
      lines: [{ productType: "uv_print", files: [uvFile] }],
    });
    expect(res.success).toBe(false);
    expect(JSON.stringify(res.error?.issues)).toContain("uv_details_required");
  });

  it("admin update accepts a UV line", () => {
    expect(
      updateAdminOrderSchema.safeParse({
        phone: "+37379123456",
        lines: [{ productType: "uv_print", uv, files: [uvFile] }],
      }).success,
    ).toBe(true);
  });

  it("cabinet and legacy flat bodies cannot order UV", () => {
    const cabinet = createOrderSchema.safeParse({
      phone: "+37379123456",
      lines: [{ productType: "uv_print", files: [uvFile] }],
    });
    expect(cabinet.success).toBe(false);
    expect(JSON.stringify(cabinet.error?.issues)).toContain("uv_admin_only");
    const legacy = createAdminOrderSchema.safeParse({ phone: "+37379123456", productType: "uv_print", files: [uvFile] });
    expect(legacy.success).toBe(false);
  });
});

describe("sublimation lines", () => {
  const sublFile = { ...validFile, color: "color" as const, paperType: "sublimation" };
  const sublimation = { variantId: "00000000-0000-4000-8000-000000000020", quantity: 2 };

  it("admin create / update accept a sublimation line with its blank and reject one without", () => {
    const parsed = createAdminOrderSchema.parse({
      phone: "+37379123456",
      lines: [{ productType: "sublimation_print", customerType: "dealer", sublimation, files: [sublFile] }],
    });
    expect(parsed.lines?.[0]?.sublimation).toEqual(sublimation);
    const res = createAdminOrderSchema.safeParse({
      phone: "+37379123456",
      lines: [{ productType: "sublimation_print", files: [sublFile] }],
    });
    expect(JSON.stringify(res.error?.issues)).toContain("subl_details_required");
    expect(
      updateAdminOrderSchema.safeParse({
        phone: "+37379123456",
        lines: [{ productType: "sublimation_print", sublimation, files: [sublFile] }],
      }).success,
    ).toBe(true);
    expect(
      createAdminOrderSchema.safeParse({
        phone: "+37379123456",
        lines: [{ productType: "sublimation_print", sublimation: { ...sublimation, quantity: 0 }, files: [sublFile] }],
      }).success,
    ).toBe(false);
  });

  it("the cabinet and legacy flat bodies cannot order sublimation", () => {
    const cabinet = createOrderSchema.safeParse({
      phone: "+37379123456",
      lines: [{ productType: "sublimation_print", files: [sublFile] }],
    });
    expect(JSON.stringify(cabinet.error?.issues)).toContain("subl_admin_only");
    expect(
      createAdminOrderSchema.safeParse({ phone: "+37379123456", productType: "sublimation_print", files: [sublFile] }).success,
    ).toBe(false);
  });
});

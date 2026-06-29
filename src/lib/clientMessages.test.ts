import { describe, it, expect } from "vitest";
import {
  clientMessageSchema,
  serializeClientMessage,
} from "./clientMessages";

const baseRaw = {
  id: "m1",
  text: "hello",
  createdAt: new Date("2026-06-29T10:00:00Z"),
  editedAt: null,
  userId: "u-staff",
  user: { name: "Anna Admin", displayName: null, role: "admin" },
};

describe("serializeClientMessage", () => {
  it("flags staff authors (role !== customer) as isStaff", () => {
    const dto = serializeClientMessage(baseRaw, "someone-else");
    expect(dto.isStaff).toBe(true);
    expect(dto.isOwn).toBe(false);
  });

  it("flags customer authors as not staff", () => {
    const dto = serializeClientMessage(
      { ...baseRaw, userId: "u-cust", user: { name: "Ivan", displayName: null, role: "customer" } },
      "someone-else",
    );
    expect(dto.isStaff).toBe(false);
  });

  it("marks the requesting user's own message as isOwn", () => {
    const dto = serializeClientMessage(baseRaw, "u-staff");
    expect(dto.isOwn).toBe(true);
  });

  it("prefers displayName over name for authorName", () => {
    const withDisplay = serializeClientMessage(
      { ...baseRaw, user: { ...baseRaw.user, displayName: "Studio Anna" } },
      "x",
    );
    expect(withDisplay.authorName).toBe("Studio Anna");

    const withoutDisplay = serializeClientMessage(baseRaw, "x");
    expect(withoutDisplay.authorName).toBe("Anna Admin");
  });

  it("passes through id/text/createdAt/editedAt", () => {
    const edited = new Date("2026-06-29T11:00:00Z");
    const dto = serializeClientMessage({ ...baseRaw, editedAt: edited }, "x");
    expect(dto.id).toBe("m1");
    expect(dto.text).toBe("hello");
    expect(dto.createdAt).toEqual(baseRaw.createdAt);
    expect(dto.editedAt).toEqual(edited);
  });
});

describe("clientMessageSchema", () => {
  it("accepts a normal message", () => {
    expect(clientMessageSchema.parse({ text: "hi" })).toEqual({ text: "hi" });
  });

  it("rejects an empty message", () => {
    expect(clientMessageSchema.safeParse({ text: "" }).success).toBe(false);
  });

  it("rejects a message over 1000 chars", () => {
    expect(
      clientMessageSchema.safeParse({ text: "x".repeat(1001) }).success,
    ).toBe(false);
  });
});

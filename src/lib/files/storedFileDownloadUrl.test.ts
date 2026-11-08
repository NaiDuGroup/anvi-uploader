import { describe, expect, it } from "vitest";
import { storedFileDownloadUrl } from "./storedFileDownloadUrl";

describe("storedFileDownloadUrl", () => {
  it("uses the staff endpoint by default", () => {
    expect(storedFileDownloadUrl("abc", false)).toBe("/api/download/abc");
  });
  it("uses the cabinet endpoint for dealers", () => {
    expect(storedFileDownloadUrl("abc", true)).toBe("/api/cabinet/files/abc/download");
  });
  it("encodes the id", () => {
    expect(storedFileDownloadUrl("a/b", true)).toBe("/api/cabinet/files/a%2Fb/download");
  });
});

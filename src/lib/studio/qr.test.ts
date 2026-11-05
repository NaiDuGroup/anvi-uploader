import { describe, expect, it } from "vitest";
import { qrPayload, qrPrefill } from "./qr";

describe("QR prefill from «Datele mele»", () => {
  const fields = { name: "Ion QA", title: "Tester", company: "QA SRL", phone: "+37360000000", email: "qa@example.com", site: "example.com" };

  it("fills the phone, the contact card and the link", () => {
    expect(qrPrefill("tel", {}, fields)).toEqual({ phone: "+37360000000" });
    expect(qrPrefill("vcard", {}, fields)).toEqual(fields);
    expect(qrPrefill("url", {}, fields)).toEqual({ url: "example.com" });
    expect(qrPayload("tel", qrPrefill("tel", {}, fields))).toBe("tel:+37360000000");
  });

  it("keeps what was typed and leaves Wi-Fi alone", () => {
    expect(qrPrefill("tel", { phone: "+37369111111" }, fields)).toEqual({ phone: "+37369111111" });
    expect(qrPrefill("vcard", { name: "Ana", phone: "" }, { phone: "+373" })).toEqual({ name: "Ana", phone: "+373" });
    expect(qrPrefill("wifi", { ssid: "Cafe" }, fields)).toEqual({ ssid: "Cafe" });
    expect(qrPrefill("url", { url: "a.md" }, undefined)).toEqual({ url: "a.md" });
  });
});

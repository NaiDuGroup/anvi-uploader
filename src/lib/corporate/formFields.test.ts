import { describe, expect, it } from "vitest";
import { CORPORATE_FORM_FIELD_ORDER, clearCorporateFieldError, firstCorporateErrorField } from "./formFields";
import { parseCorporateRequest } from "./requestRules";

describe("«Pentru companii» form: first wrong field", () => {
  it("follows the page order, not the order the errors were found in", () => {
    expect(firstCorporateErrorField({ consent: "consent", email: "invalid", products: "required" })).toBe("email");
    expect(firstCorporateErrorField({ hasLogo: "required", deadline: "invalid" })).toBe("deadline");
    expect(firstCorporateErrorField({ consent: "consent" })).toBe("consent");
  });

  it("none → null; empty values do not count; unknown server keys come last", () => {
    expect(firstCorporateErrorField({})).toBeNull();
    expect(firstCorporateErrorField({ email: undefined })).toBeNull();
    expect(firstCorporateErrorField({ lang: "invalid" })).toBe("lang");
    expect(firstCorporateErrorField({ lang: "invalid", budget: "invalid" })).toBe("budget");
  });

  it("covers every field the server validates (except the language and the honeypot)", () => {
    const r = parseCorporateRequest({});
    expect(r.ok).toBe(false);
    const keys = r.ok ? [] : Object.keys(r.errors);
    for (const k of keys) {
      if (k === "lang") continue;
      expect(CORPORATE_FORM_FIELD_ORDER as readonly string[]).toContain(k);
    }
  });
});

describe("clearCorporateFieldError", () => {
  it("drops only that field; same object when nothing to clear", () => {
    const errs = { email: "invalid", phone: "invalid" };
    expect(clearCorporateFieldError(errs, "email")).toEqual({ phone: "invalid" });
    expect(errs).toEqual({ email: "invalid", phone: "invalid" });
    expect(clearCorporateFieldError(errs, "budget")).toBe(errs);
  });
});

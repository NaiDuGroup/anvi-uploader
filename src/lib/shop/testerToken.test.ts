import { describe, expect, it } from "vitest";
import {
  SHOP_TESTER_LINK_TTL_MS,
  SHOP_TESTER_PASS_TTL_MS,
  shopTesterSecret,
  signShopTesterToken,
  verifyShopTesterToken,
} from "./testerToken";

const S = "tester-secret-0123456789";
const NOW = 1_762_250_000_000;

describe("tester token", () => {
  it("secret: SHOP_TESTER_SECRET, else CRON_SECRET; too short or missing → off", () => {
    expect(shopTesterSecret({ SHOP_TESTER_SECRET: S, CRON_SECRET: "cron-secret-0123456789" })).toBe(S);
    expect(shopTesterSecret({ CRON_SECRET: "cron-secret-0123456789" })).toBe("cron-secret-0123456789");
    expect(shopTesterSecret({ SHOP_TESTER_SECRET: "short" })).toBeNull();
    expect(shopTesterSecret({})).toBeNull();
  });

  it("a link token is valid for 10 minutes, then expires", () => {
    const t = signShopTesterToken("link", S, NOW);
    expect(verifyShopTesterToken(t, "link", S, NOW)).toBe(true);
    expect(verifyShopTesterToken(t, "link", S, NOW + SHOP_TESTER_LINK_TTL_MS - 1)).toBe(true);
    expect(verifyShopTesterToken(t, "link", S, NOW + SHOP_TESTER_LINK_TTL_MS)).toBe(false);
  });

  it("a pass lives 7 days", () => {
    const t = signShopTesterToken("pass", S, NOW);
    expect(verifyShopTesterToken(t, "pass", S, NOW + SHOP_TESTER_PASS_TTL_MS - 1)).toBe(true);
    expect(verifyShopTesterToken(t, "pass", S, NOW + SHOP_TESTER_PASS_TTL_MS)).toBe(false);
  });

  it("rejects the wrong kind, secret, tampering and garbage", () => {
    const link = signShopTesterToken("link", S, NOW);
    expect(verifyShopTesterToken(link, "pass", S, NOW)).toBe(false);
    expect(verifyShopTesterToken(link, "link", "other-secret-0123456789", NOW)).toBe(false);
    expect(verifyShopTesterToken(link, "link", null, NOW)).toBe(false);
    const [v, k, exp, nonce, sig] = link.split(".");
    // Extending the expiry breaks the signature.
    expect(verifyShopTesterToken([v, k, String(Number(exp) + 1e9), nonce, sig].join("."), "link", S, NOW)).toBe(false);
    expect(verifyShopTesterToken([v, "pass", exp, nonce, sig].join("."), "pass", S, NOW)).toBe(false);
    for (const bad of ["", "x", "v1.link.1.2", "v1.link.abc.n.s", `${link}x`, undefined, null]) {
      expect(verifyShopTesterToken(bad, "link", S, NOW)).toBe(false);
    }
  });
});

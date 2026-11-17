import { describe, expect, it } from "vitest";
import { orderNumberFromSearch, orderSearchSql } from "./orderSearchSql";
import { normalizePhoneDigits, PHONE_LOCAL_SQL_PREFIX } from "./phoneNormalize";

/** JS twin of the SQL: does `phone` match the LIKE patterns the filter builds? */
function sqlMatches(rawSearch: string, phone: string, orderNumber: number): boolean {
  const sql = orderSearchSql(rawSearch);
  const text = sql.sql;
  const values = [...sql.values];
  const likeOn = (subject: string, pattern: unknown) =>
    typeof pattern === "string" && subject.includes(pattern.replace(/^%|%$/g, ""));
  const digits = normalizePhoneDigits(phone);
  const local = digits.replace(new RegExp(PHONE_LOCAL_SQL_PREFIX), "");
  // Order of values follows the order of the OR terms.
  let i = 0;
  let hit = false;
  for (const term of text.split(" OR ")) {
    if (term.includes("order_number")) hit ||= values[i++] === orderNumber;
    else if (term.includes("regexp_replace(regexp_replace")) {
      i++; // the prefix regex parameter
      hit ||= likeOn(local, values[i++]);
    } else if (term.includes("regexp_replace")) hit ||= likeOn(digits, values[i++]);
    else hit ||= likeOn(phone, values[i++]);
  }
  return hit;
}

describe("orderSearchSql", () => {
  const stored = "+373 68 900 999";

  it("finds a phone however the spaces and prefix are typed", () => {
    for (const q of ["+373 68 900999", "+37368900999", "37368900999", "068900999", "68900999", "068 900 999", "900999", "(068) 900-999"]) {
      expect(sqlMatches(q, stored, 1), q).toBe(true);
      expect(sqlMatches(q, "068900999", 1), q).toBe(true);
      expect(sqlMatches(q, "68 900 999", 1), q).toBe(true);
    }
  });

  it("does not match a different number", () => {
    expect(sqlMatches("068900998", stored, 1)).toBe(false);
    expect(sqlMatches("+373 69 900 999", stored, 1)).toBe(false);
  });

  it("still finds the order number, with or without #", () => {
    expect(sqlMatches("10300", "+373 60 000 000", 10300)).toBe(true);
    expect(sqlMatches("#10300", "+373 60 000 000", 10300)).toBe(true);
    expect(sqlMatches("#10300", "+373 60 000 000", 10301)).toBe(false);
  });

  it("keeps the plain text match for non-phone queries", () => {
    const sql = orderSearchSql("abc");
    expect(sql.sql).not.toContain("regexp_replace");
    expect(sql.values).toEqual(["%abc%"]);
  });

  it("is empty for an empty query", () => {
    expect(orderSearchSql("   ").sql).toBe("");
  });
});

describe("orderNumberFromSearch", () => {
  it("reads plain and # numbers, rejects text and overflow", () => {
    expect(orderNumberFromSearch("10300")).toBe(10300);
    expect(orderNumberFromSearch("#10300")).toBe(10300);
    expect(orderNumberFromSearch("# 10300")).toBe(10300);
    expect(orderNumberFromSearch("Ion")).toBeNull();
    expect(orderNumberFromSearch("37368900999")).toBeNull();
  });
});

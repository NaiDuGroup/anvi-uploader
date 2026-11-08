import { describe, expect, it } from "vitest";
import {
  createErrorDeduper,
  decideToast,
  describeApiError,
  friendlyErrorText,
  isHumanReadableServerMessage,
  serverMessageFromBody,
  shouldWatchUrl,
} from "./apiErrorMessage";

describe("describeApiError", () => {
  it("403 superadmin only → friendly text with the super admin hint, never raw", () => {
    const m = describeApiError({ locale: "ru", status: 403, serverMessage: "Forbidden: superadmin only" });
    expect(m.kind).toBe("forbidden");
    expect(m.title).toBe("У вас нет прав на это действие");
    expect(m.description).toBe("Это может сделать только главный администратор");
    expect(`${m.title} ${m.description}`).not.toContain("Forbidden");
  });

  it("403 for shop customers has no super admin hint", () => {
    const m = describeApiError({ locale: "ro", status: 403, serverMessage: "Forbidden: superadmin only", audience: "customer" });
    expect(m.title).toBe("Nu aveți drepturi pentru această acțiune");
    expect(m.description).toBeUndefined();
  });

  it("maps every status class", () => {
    const k = (status: number | null) => describeApiError({ locale: "ro", status }).kind;
    expect(k(401)).toBe("unauthorized");
    expect(k(404)).toBe("notFound");
    expect(k(400)).toBe("rejected");
    expect(k(409)).toBe("rejected");
    expect(k(422)).toBe("rejected");
    expect(k(413)).toBe("tooLarge");
    expect(k(429)).toBe("tooManyRequests");
    expect(k(500)).toBe("server");
    expect(k(503)).toBe("server");
    expect(k(0)).toBe("offline");
    expect(k(null)).toBe("offline");
    expect(k(418)).toBe("generic");
  });

  it("5xx says nothing was saved", () => {
    const m = describeApiError({ locale: "ru", status: 500, serverMessage: "Internal error" });
    expect(m.title).toBe("Ошибка на сервере");
    expect(m.description).toContain("не сохранены");
  });

  it("400/409 show a readable server message, technical ones fall back", () => {
    expect(describeApiError({ locale: "ru", status: 409, serverMessage: "Артикул уже занят" }).title).toBe("Артикул уже занят");
    expect(describeApiError({ locale: "ru", status: 400, serverMessage: "invalid_json" }).title).toBe(
      "Не получилось — проверьте данные и попробуйте ещё раз",
    );
    expect(describeApiError({ locale: "ro", status: 422, serverMessage: "Validation failed" }).title).toBe(
      "Nu s-a reușit — verificați datele și încercați din nou",
    );
  });
});

describe("isHumanReadableServerMessage", () => {
  it.each([
    ["Unauthorized", "ru", false],
    ["Forbidden: superadmin only", "ru", false],
    ["not_found", "en", false],
    ["expired", "en", false],
    ["Invalid JSON", "en", false],
    ["PrismaClientKnownRequestError P2002", "en", false],
    ["Клиент не найден", "ro", true],
    ["Fișierul nu a fost găsit", "ro", true],
    ["Too many positions", "ru", false],
    ["Too many positions", "en", true],
    ["", "ru", false],
  ] as const)("%s (%s) → %s", (msg, locale, expected) => {
    expect(isHumanReadableServerMessage(msg, locale)).toBe(expected);
  });
});

describe("serverMessageFromBody", () => {
  it("reads error / message / nested error.message", () => {
    expect(serverMessageFromBody({ error: "x y" })).toBe("x y");
    expect(serverMessageFromBody({ message: "m", error: "e" })).toBe("m");
    expect(serverMessageFromBody({ error: { message: "deep" } })).toBe("deep");
    expect(serverMessageFromBody(null)).toBeNull();
    expect(serverMessageFromBody("str")).toBeNull();
  });
});

describe("shouldWatchUrl", () => {
  const o = "https://print.anvi.md";
  it("same-origin /api only, minus auth and beacons", () => {
    expect(shouldWatchUrl("/api/admin/clients/1", o)).toBe(true);
    expect(shouldWatchUrl(`${o}/api/orders`, o)).toBe(true);
    expect(shouldWatchUrl("https://r2.example.com/api/x", o)).toBe(false);
    expect(shouldWatchUrl("/admin/clients", o)).toBe(false);
    expect(shouldWatchUrl("/api/auth/login", o)).toBe(false);
    expect(shouldWatchUrl("/api/cabinet/auth/logout", o)).toBe(false);
    expect(shouldWatchUrl("/api/shop/account/login", o)).toBe(false);
    expect(shouldWatchUrl("/api/shop/e", o)).toBe(false);
  });
});

describe("decideToast", () => {
  it("GET only reports 401; mutations report everything", () => {
    expect(decideToast("GET", 500)).toBe("skip");
    expect(decideToast("GET", 403)).toBe("skip");
    expect(decideToast("GET", 401)).toBe("toast");
    expect(decideToast("delete", 403)).toBe("toast");
    expect(decideToast("POST", null)).toBe("toast");
  });
});

describe("createErrorDeduper", () => {
  it("throttles the same key within the window", () => {
    let now = 0;
    const d = createErrorDeduper({ windowMs: 1000, now: () => now });
    expect(d.take("403")).toBe(true);
    expect(d.take("403")).toBe(false);
    expect(d.take("5xx")).toBe(true);
    now = 999;
    expect(d.take("403")).toBe(false);
    now = 2500;
    expect(d.take("403")).toBe(true);
  });

  it("sticky keys stay muted until reset", () => {
    let now = 0;
    const d = createErrorDeduper({ windowMs: 1000, stickyKeys: ["offline"], now: () => now });
    expect(d.take("offline")).toBe(true);
    now = 60_000;
    expect(d.take("offline")).toBe(false);
    d.reset("offline");
    expect(d.take("offline")).toBe(true);
  });
});

describe("friendlyErrorText", () => {
  it("builds one line from a failed Response", async () => {
    const res = new Response(JSON.stringify({ error: "Forbidden: superadmin only" }), { status: 403 });
    expect(await friendlyErrorText(res, "ru")).toBe(
      "У вас нет прав на это действие. Это может сделать только главный администратор",
    );
    expect(await friendlyErrorText(null, "en")).toBe("No connection — check your internet and try again");
  });
});

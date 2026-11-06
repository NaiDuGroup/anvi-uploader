import { describe, expect, it } from "vitest";
import { SHOP_CATEGORIES } from "./catalogConfig";
import { SHOP_LANGS } from "./i18n";
import { SHOP_PHOTO_PRINT_PATH } from "./links";
import { SHOP_NAV_BAR, SHOP_NAV_GROUPS, SHOP_NAV_SEASONAL, buildShopNav, shopNavName, shopNavPath, type ShopNavKey } from "./shopNav";

const grouped: ShopNavKey[] = SHOP_NAV_GROUPS.flatMap((g) => [...g.links]);

describe("shop nav config", () => {
  it("has the three approved groups in order", () => {
    expect(SHOP_NAV_GROUPS.map((g) => g.id)).toEqual(["photo-gifts", "print", "merch"]);
    expect(SHOP_NAV_GROUPS.map((g) => g.title.ro)).toEqual(["Cadouri cu poza ta", "Tipar", "Merch pentru companii"]);
  });

  it("puts every stock category in exactly one group or the seasonal entry", () => {
    const placed: ShopNavKey[] = [...grouped, ...(SHOP_NAV_SEASONAL ? [SHOP_NAV_SEASONAL.key] : [])];
    for (const c of SHOP_CATEGORIES) {
      expect(placed.filter((k) => k === c.slug), c.slug).toHaveLength(1);
    }
    // No duplicates at all (services included).
    expect(new Set(placed).size).toBe(placed.length);
  });

  it("lists the service pages under «Tipar»", () => {
    expect(SHOP_NAV_GROUPS.find((g) => g.id === "print")!.links).toEqual(["tipografie", "print-mare-format", "printare"]);
  });

  it("has one seasonal entry: Crăciun, not inside a group", () => {
    expect(SHOP_NAV_SEASONAL).toEqual({ key: "craciun", icon: "snowflake" });
    expect(grouped).not.toContain(SHOP_NAV_SEASONAL!.key);
  });

  it("keeps the header bar short and inside the menu", () => {
    expect(SHOP_NAV_BAR).toEqual(["cani", "tricouri", "tipografie", "print-mare-format"]);
    for (const k of SHOP_NAV_BAR) expect(grouped).toContain(k);
  });

  it("keeps the URLs unchanged", () => {
    expect(shopNavPath("cani")).toBe("/shop/cani");
    expect(shopNavPath("cadouri")).toBe("/shop/cadouri");
    expect(shopNavPath("tipografie")).toBe("/shop/tipografie");
    expect(shopNavPath("print-mare-format")).toBe("/shop/print-mare-format");
    expect(shopNavPath("printare")).toBe(SHOP_PHOTO_PRINT_PATH);
  });

  it("names every destination in every language", () => {
    for (const lang of SHOP_LANGS) {
      for (const k of [...grouped, "craciun" as const]) expect(shopNavName(k, lang).length, `${k} ${lang}`).toBeGreaterThan(1);
    }
    expect(shopNavName("cadouri", "ro")).toBe("Suveniruri");
    expect(shopNavName("cadouri", "ru")).toBe("Сувениры");
    expect(shopNavName("cadouri", "en")).toBe("Souvenirs");
  });
});

describe("buildShopNav", () => {
  it("hides empty categories, keeps unknown counts, short bar labels", () => {
    const nav = buildShopNav("ru", {
      cani: { count: 18, image: "/m.jpg" },
      tricouri: { count: 4 },
      jucarii: { count: 0 },
      craciun: { count: 6 },
      tipografie: { count: 12 },
    });
    const gifts = nav.groups.find((g) => g.id === "photo-gifts")!;
    expect(gifts.title).toBe("Подарки с вашим фото");
    expect(gifts.links.map((l) => l.key)).toEqual(["cani", "caiete", "tricouri", "cadouri"]);
    expect(gifts.links[0]).toMatchObject({ name: "Кружки", count: 18, image: "/m.jpg", path: "/shop/cani" });
    expect(gifts.links.find((l) => l.key === "caiete")!.count).toBeNull();
    expect(nav.bar.map((l) => l.short)).toEqual(["Кружки", "Футболки", "Полиграфия", "Широкоформат"]);
    expect(nav.bar[1]!.name).toBe("Футболки и кепки");
    expect(nav.seasonal).toMatchObject({ key: "craciun", name: "Новый год", count: 6, icon: "snowflake" });
    const print = nav.groups.find((g) => g.id === "print")!;
    expect(print.links.map((l) => l.name)).toEqual(["Полиграфия", "Широкоформатная печать", "Фото и документы"]);
    expect(print.links[2]!.image).toBe("/photo-print.svg");
  });

  it("drops a group whose categories are all empty, and an empty seasonal entry", () => {
    const nav = buildShopNav("ro", { pixuri: { count: 0 }, genti: { count: 0 }, sticle: { count: 0 }, jocuri: { count: 0 }, craciun: { count: 0 } });
    expect(nav.groups.map((g) => g.id)).toEqual(["photo-gifts", "print"]);
    expect(nav.seasonal).toBeNull();
  });
});

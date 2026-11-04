import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { shopHidesBottomNav } from "./bottomNav";

describe("shopHidesBottomNav", () => {
  it("hides the tab bar on every page with its own fixed bottom bar", () => {
    for (const p of ["/p/cana-alba", "/printare", "/carti-de-vizita", "/checkout", "/pay/test"]) {
      expect(shopHidesBottomNav(p), p).toBe(true);
    }
  });

  it("keeps it elsewhere (the editor's bar sits above it)", () => {
    for (const p of ["/", "/cos", "/cani", "/cont", "/comenzi", "/editor/mug", "/intrebari", "/printare-x", "/payments"]) {
      expect(shopHidesBottomNav(p), p).toBe(false);
    }
  });

  it("every view with a fixed bottom bar is on a hidden route", () => {
    const views: Record<string, string> = {
      "ProductView.tsx": "/p/x",
      "PrintView.tsx": "/printare",
      "BusinessCardView.tsx": "/carti-de-vizita",
    };
    for (const [file, route] of Object.entries(views)) {
      const src = readFileSync(join(__dirname, "../../components/shop", file), "utf8");
      expect(src, file).toMatch(/fixed inset-x-0 bottom-0 z-40/);
      expect(shopHidesBottomNav(route), file).toBe(true);
    }
  });
});

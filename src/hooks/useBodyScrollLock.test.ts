import { describe, expect, it } from "vitest";
import { lockBodyScroll } from "./useBodyScrollLock";

function fakePage(opts: { innerWidth: number; clientWidth: number; padding?: string; bodyOverflow?: string }) {
  const doc = {
    documentElement: { style: { overflow: "" }, clientWidth: opts.clientWidth },
    body: { style: { overflow: opts.bodyOverflow ?? "", paddingRight: "" } },
  };
  const win = {
    innerWidth: opts.innerWidth,
    getComputedStyle: () => ({ paddingRight: opts.padding ?? "0px" }),
  };
  return { doc, win };
}

describe("lockBodyScroll", () => {
  it("hides overflow on html + body and pads for the scrollbar", () => {
    const { doc, win } = fakePage({ innerWidth: 1015, clientWidth: 1000, padding: "4px" });
    const unlock = lockBodyScroll(doc, win);
    expect(doc.documentElement.style.overflow).toBe("hidden");
    expect(doc.body.style.overflow).toBe("hidden");
    expect(doc.body.style.paddingRight).toBe("19px");
    unlock();
    expect(doc.documentElement.style.overflow).toBe("");
    expect(doc.body.style.overflow).toBe("");
    expect(doc.body.style.paddingRight).toBe("");
  });

  it("adds no padding with overlay scrollbars", () => {
    const { doc, win } = fakePage({ innerWidth: 1000, clientWidth: 1000 });
    const unlock = lockBodyScroll(doc, win);
    expect(doc.body.style.paddingRight).toBe("");
    unlock();
  });

  it("keeps the page locked until the last stacked overlay closes", () => {
    const { doc, win } = fakePage({ innerWidth: 1000, clientWidth: 1000, bodyOverflow: "auto" });
    const drawer = lockBodyScroll(doc, win);
    const comments = lockBodyScroll(doc, win);
    comments();
    expect(doc.body.style.overflow).toBe("hidden");
    comments(); // a second call of the same unlock is ignored
    expect(doc.body.style.overflow).toBe("hidden");
    drawer();
    expect(doc.body.style.overflow).toBe("auto");
    expect(doc.documentElement.style.overflow).toBe("");
  });

  it("restores when overlays close in opening order", () => {
    const { doc, win } = fakePage({ innerWidth: 1000, clientWidth: 1000 });
    const a = lockBodyScroll(doc, win);
    const b = lockBodyScroll(doc, win);
    a();
    expect(doc.body.style.overflow).toBe("hidden");
    b();
    expect(doc.body.style.overflow).toBe("");
  });
});

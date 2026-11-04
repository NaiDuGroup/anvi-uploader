import { describe, expect, it } from "vitest";
import { parsePublicQuoteLine } from "@/lib/publicQuote/publicQuoteSchema";
import { pluralIndex, shopT } from "./i18n";
import { clampPrintPagesInput, printProblem } from "./printForm";
import { SHOP_PRINT_MAX_PAGES } from "./printPrices";

describe("clampPrintPagesInput — one max for the field and the price", () => {
  it("99999 shows and prices the server max", () => {
    expect(clampPrintPagesInput("99999")).toEqual({ draft: String(SHOP_PRINT_MAX_PAGES), pages: SHOP_PRINT_MAX_PAGES });
    const ok = parsePublicQuoteLine({
      kind: "print",
      mode: "doc",
      items: [{ format: "A4", color: "bw", sides: "one", pages: clampPrintPagesInput("99999").pages, copies: 1 }],
    });
    expect(ok.ok).toBe(true);
  });

  it("digits only; empty and 0 are no count", () => {
    expect(clampPrintPagesInput("12a")).toEqual({ draft: "12", pages: 12 });
    expect(clampPrintPagesInput("")).toEqual({ draft: "", pages: null });
    expect(clampPrintPagesInput("0")).toEqual({ draft: "0", pages: null });
    expect(clampPrintPagesInput("007")).toEqual({ draft: "7", pages: 7 });
  });
});

describe("printProblem — the add-to-cart message follows the form", () => {
  const base = { count: 2, uploading: false, failed: false, noPages: true, priced: false };
  it("asks for the pages, and clears once they are entered", () => {
    expect(printProblem(base)).toBe("printPagesRequired");
    expect(printProblem({ ...base, noPages: false, priced: true })).toBeNull();
  });
  it("orders the problems", () => {
    expect(printProblem({ ...base, count: 0 })).toBe("printFilesRequired");
    expect(printProblem({ ...base, uploading: true })).toBe("printWaitUpload");
    expect(printProblem({ ...base, failed: true })).toBe("printUploadErrors");
  });
});

describe("plurals in the shop texts", () => {
  it("«5 fișiere», «20 de fișiere», «1 fișier»; ru «2 файла / 5 файлов»; en «1 file / 2 files»", () => {
    const ro = shopT("ro");
    expect(ro("printFilesN", { n: 1 })).toBe("1 fișier");
    expect(ro("printFilesN", { n: 5 })).toBe("5 fișiere");
    expect(ro("printFilesN", { n: 20 })).toBe("20 de fișiere");
    expect(ro("printPhotosN", { n: 1 })).toBe("1 fotografie");
    const ru = shopT("ru");
    expect(ru("printFilesN", { n: 1 })).toBe("1 файл");
    expect(ru("printFilesN", { n: 3 })).toBe("3 файла");
    expect(ru("printFilesN", { n: 11 })).toBe("11 файлов");
    expect(ru("printFilesN", { n: 22 })).toBe("22 файла");
    const en = shopT("en");
    expect(en("printFilesN", { n: 1 })).toBe("1 file");
    expect(en("printFilesN", { n: 5 })).toBe("5 files");
    expect(en("printPrintedPages", { n: 1 })).toBe("1 printed page");
  });
  it("pluralIndex matches itemsLabel's Romanian rule", () => {
    expect([0, 1, 2, 19, 20, 101, 119, 120].map((n) => pluralIndex(n, "ro"))).toEqual([1, 0, 1, 1, 2, 1, 1, 2]);
  });
});

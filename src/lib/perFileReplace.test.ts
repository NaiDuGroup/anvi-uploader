import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ru } from "@/lib/i18n/ru";
import { layoutIssueRu } from "@/lib/i18n/layoutIssue/ru";
import { layoutIssueRo } from "@/lib/i18n/layoutIssue/ro";
import { layoutIssueEn } from "@/lib/i18n/layoutIssue/en";
import { cabinetReplaceButtons } from "@/lib/ownerLineFileReplace";
import { staffReplaceBody, staffReplaceLineFile } from "@/lib/layoutIssueClient";
import { LayoutIssueError } from "@/lib/orderLineLayoutIssue";
import { describeHistoryEntry, replacedFileNames, type HistoryEntry } from "@/lib/orderHistoryFormat";
import StaffReplaceLayoutFileDialog, { initialReplaceFileId } from "@/app/admin/_components/StaffReplaceLayoutFileDialog";
import { ReplaceLayoutFileDialog, replaceRequestBody } from "@/app/cabinet/orders/[id]/ReplaceLayoutFileDialog";

vi.mock("server-only", () => ({}));

/**
 * Per-file replace (a line with several files): every replace names ONE file
 * (`fileId`). Pure helpers, request bodies, history wording and the two dialogs.
 */

const up = { fileName: "new.png", fileUrl: "uploads/1-00000001-new.png" };

describe("request bodies carry the fileId", () => {
  it("cabinet layout fix: { fileId, files: [one] } without kind", () => {
    expect(replaceRequestBody("layout", "f2", up)).toEqual({ fileId: "f2", files: [up] });
  });
  it("cabinet waiting replace: kind «replace» + fileId", () => {
    expect(replaceRequestBody("replace", "f2", up)).toEqual({ fileId: "f2", files: [up], kind: "replace" });
  });
  it("no fileId (file-less position): left out, never null / empty", () => {
    expect(replaceRequestBody("layout", null, up)).toEqual({ files: [up] });
    expect("fileId" in replaceRequestBody("replace", null, up)).toBe(false);
  });
  it("staff body: fileId + exactly one file", () => {
    expect(staffReplaceBody("f3", up)).toEqual({ fileId: "f3", files: [up] });
    expect(staffReplaceBody(null, up)).toEqual({ files: [up] });
  });
  it("staffReplaceLineFile posts the fileId and throws the server code", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ error: "file_not_in_line" }), { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(staffReplaceLineFile("o1", "l1", "f9", up)).rejects.toThrow("file_not_in_line");
      expect(calls).toEqual([{ url: "/api/orders/o1/lines/l1/replace-file", body: { fileId: "f9", files: [up] } }]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("cabinetReplaceButtons", () => {
  it("one file → the position's own button", () => {
    expect(cabinetReplaceButtons({ flagged: false, canReplaceFile: true, fileCount: 1 })).toBe("line");
    expect(cabinetReplaceButtons({ flagged: true, canReplaceFile: false, fileCount: 1 })).toBe("line");
  });
  it("several files → a «Заменить» per file (waiting or flagged)", () => {
    expect(cabinetReplaceButtons({ flagged: false, canReplaceFile: true, fileCount: 3 })).toBe("perFile");
    expect(cabinetReplaceButtons({ flagged: true, canReplaceFile: false, fileCount: 2 })).toBe("perFile");
  });
  it("a flagged position without files keeps the position button (the fix adds the file)", () => {
    expect(cabinetReplaceButtons({ flagged: true, canReplaceFile: false, fileCount: 0 })).toBe("line");
  });
  it("neither flagged nor replaceable (printing, done, locked) → none, whatever the file count", () => {
    for (const fileCount of [0, 1, 5]) {
      expect(cabinetReplaceButtons({ flagged: false, canReplaceFile: false, fileCount })).toBe("none");
    }
  });
});

describe("initialReplaceFileId (staff dialog pre-selection)", () => {
  const files = [
    { id: "a", fileName: "a.png" },
    { id: "b", fileName: "b.png" },
  ];
  it("the only file is pre-selected", () => {
    expect(initialReplaceFileId({ currentFiles: [files[0]!] })).toBe("a");
  });
  it("several files: nothing until picked", () => {
    expect(initialReplaceFileId({ currentFiles: files })).toBeNull();
  });
  it("a requested file on the line wins; a stale one is ignored", () => {
    expect(initialReplaceFileId({ currentFiles: files, initialFileId: "b" })).toBe("b");
    expect(initialReplaceFileId({ currentFiles: files, initialFileId: "gone" })).toBeNull();
    expect(initialReplaceFileId({ currentFiles: [files[0]!], initialFileId: "gone" })).toBe("a");
  });
});

describe("history names the replaced file", () => {
  const entry = (action: string, metadata: Record<string, unknown>): HistoryEntry => ({
    id: "1",
    action,
    field: "files",
    oldValue: null,
    newValue: null,
    metadata,
    createdAt: "2026-11-06T10:00:00Z",
    userName: "u",
    userRole: "customer",
  });

  it("line_layout_fixed with both names: «заменил(а) файл в позиции #9781.1/2: IMG_1.jpg → new.pdf»", () => {
    expect(
      describeHistoryEntry(entry("line_layout_fixed", { lineCode: "#9781.1/2", by: "client", replacedFileName: "IMG_1.jpg", newFileName: "new.pdf" }), ru).text,
    ).toBe("заменил(а) файл в позиции #9781.1/2: IMG_1.jpg → new.pdf");
  });
  it("line_file_replaced names both files; the actor (dealer / client) comes from the row", () => {
    const base = { lineCode: "#9781.2/2", replacedFileName: "IMG_1.jpg", newFileName: "IMG_2.jpg" };
    const d = describeHistoryEntry(entry("line_file_replaced", { ...base, role: "dealer" }), ru);
    expect(d.text).toBe("заменил(а) файл в позиции #9781.2/2: IMG_1.jpg → IMG_2.jpg");
    expect(d.kind).toBe("file_replaced");
  });
  it("older entries (whole-line swap, no names) keep a short text", () => {
    expect(describeHistoryEntry(entry("line_layout_fixed", { lineCode: "#1.1/1", by: "client" }), ru).text).toBe(
      "прислал(а) новый файл для позиции #1.1/1",
    );
    expect(describeHistoryEntry(entry("line_file_replaced", { lineCode: "#1.1/1", role: "dealer" }), ru).text).toBe(
      "заменил(а) файл в позиции #1.1/1",
    );
  });
  it("replacedFileNames needs both names as non-empty strings", () => {
    expect(replacedFileNames({ metadata: { replacedFileName: "a", newFileName: "b" } })).toEqual({ oldName: "a", newName: "b" });
    expect(replacedFileNames({ metadata: { replacedFileName: null, newFileName: "b" } })).toBeNull();
    expect(replacedFileNames({ metadata: { replacedFileName: "a", newFileName: "" } })).toBeNull();
    expect(replacedFileNames({ metadata: null })).toBeNull();
  });
});

describe("error codes", () => {
  it("file_id_required → 400, file_not_in_line → 404; the old file_count_mismatch is gone", () => {
    expect(new LayoutIssueError("file_id_required").httpStatus).toBe(400);
    expect(new LayoutIssueError("file_not_in_line").httpStatus).toBe(404);
    // @ts-expect-error removed code
    expect(new LayoutIssueError("file_count_mismatch").httpStatus).toBeUndefined();
  });
});

describe("i18n (additive keys in ru / ro / en)", () => {
  const keys = [
    "replaceFileButton",
    "replaceFileTarget",
    "replacePickFileHint",
    "replaceFileGone",
    "staffReplacePickFile",
    "staffReplacePickFileRequired",
    "historyFixedFile",
    "historyOwnerReplacedFile",
  ] as const;
  it.each([
    ["ru", layoutIssueRu],
    ["ro", layoutIssueRo],
    ["en", layoutIssueEn],
  ] as const)("%s defines every per-file key and names both files", (_l, dict) => {
    for (const k of keys) expect(dict[k], k).toBeTruthy();
    expect(dict.replaceFileTarget("IMG_1.jpg")).toContain("IMG_1.jpg");
    for (const s of [dict.historyFixedFile("#1.1/2", true, "OLD.jpg", "NEW.pdf"), dict.historyOwnerReplacedFile("#1.1/2", false, "OLD.jpg", "NEW.pdf")]) {
      expect(s).toContain("#1.1/2");
      expect(s).toContain("OLD.jpg");
      expect(s).toContain("NEW.pdf");
    }
  });
  it("ro / en are translated, not copies of ru", () => {
    expect(layoutIssueRo.replacePickFileHint).not.toBe(layoutIssueRu.replacePickFileHint);
    expect(layoutIssueEn.replacePickFileHint).not.toBe(layoutIssueRu.replacePickFileHint);
  });
});

describe("dialogs", () => {
  it("cabinet dialog names the file being replaced", () => {
    const html = renderToStaticMarkup(
      createElement(ReplaceLayoutFileDialog, {
        orderId: "o1",
        lineId: "l1",
        fileId: "f2",
        fileName: "IMG_2.jpg",
        lineCode: "#0042.1/2",
        mode: "replace",
        declared: null,
        t: ru,
        onDone: vi.fn(),
        onClose: vi.fn(),
      }),
    );
    expect(html).toContain('data-testid="replace-file-target"');
    expect(html).toContain("Заменяем файл: IMG_2.jpg");
  });
  it("cabinet dialog without a file name has no target line", () => {
    const html = renderToStaticMarkup(
      createElement(ReplaceLayoutFileDialog, { orderId: "o1", lineId: "l1", lineCode: "#1", declared: null, t: ru, onDone: vi.fn(), onClose: vi.fn() }),
    );
    expect(html).not.toContain('data-testid="replace-file-target"');
  });

  const target = (files: { id: string; fileName: string }[], initialFileId?: string) => ({
    orderId: "o1",
    lineId: "l1",
    lineCode: "#0042.3/3",
    productType: "large_format_print",
    declared: null,
    currentFiles: files,
    initialFileId,
  });
  const confirmTag = (html: string) => {
    const at = html.indexOf('data-testid="staff-replace-file-confirm"');
    return html.slice(html.lastIndexOf("<", at), html.indexOf(">", at));
  };

  it("staff dialog, several files: a radio per file, none checked, save disabled", () => {
    const html = renderToStaticMarkup(
      createElement(StaffReplaceLayoutFileDialog, {
        target: target([
          { id: "a", fileName: "a.png" },
          { id: "b", fileName: "b.png" },
          { id: "c", fileName: "c.png" },
        ]),
        onDone: vi.fn(),
        onClose: vi.fn(),
      }),
    );
    expect(html).toContain('data-testid="staff-replace-pick"');
    for (const id of ["a", "b", "c"]) expect(html).toContain(`data-testid="staff-replace-pick-${id}"`);
    expect((html.match(/type="radio"/g) ?? []).length).toBe(3);
    expect(html).not.toMatch(/checked=""/);
    expect(confirmTag(html)).toContain("disabled");
  });
  it("staff dialog, several files + initialFileId: that radio is checked", () => {
    const html = renderToStaticMarkup(
      createElement(StaffReplaceLayoutFileDialog, {
        target: target(
          [
            { id: "a", fileName: "a.png" },
            { id: "b", fileName: "b.png" },
          ],
          "b",
        ),
        onDone: vi.fn(),
        onClose: vi.fn(),
      }),
    );
    expect((html.match(/checked=""/g) ?? []).length).toBe(1);
    const b = html.indexOf('value="b"');
    expect(html.slice(html.lastIndexOf("<", b), html.indexOf(">", b))).toContain('checked=""');
  });
  it("staff dialog, one file: no picker (plain current-file box)", () => {
    const html = renderToStaticMarkup(
      createElement(StaffReplaceLayoutFileDialog, { target: target([{ id: "a", fileName: "a.png" }]), onDone: vi.fn(), onClose: vi.fn() }),
    );
    expect(html).not.toContain('data-testid="staff-replace-pick"');
    expect(html).toContain('data-testid="staff-replace-current"');
  });
});

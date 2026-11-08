import { describe, expect, it } from "vitest";
import { ro } from "@/lib/i18n/ro";
import { ru } from "@/lib/i18n/ru";
import { en } from "@/lib/i18n/en";
import {
  actorName,
  actorRole,
  describeHistoryEntry,
  groupHistoryByDay,
  historyDayLabel,
  historyStatusLabel,
  isNoiseEntry,
  summarizeOrderChanges,
  visibleHistoryEntries,
  type HistoryEntry,
} from "./orderHistoryFormat";

const e = (over: Partial<HistoryEntry>): HistoryEntry => ({
  id: Math.random().toString(36).slice(2),
  action: "field_updated",
  field: null,
  oldValue: null,
  newValue: null,
  metadata: null,
  createdAt: "2026-11-08T10:00:00.000Z",
  userName: "Vera",
  userRole: "admin",
  ...over,
});

describe("describeHistoryEntry", () => {
  it("urgency on / off", () => {
    expect(describeHistoryEntry(e({ field: "isPrio", oldValue: "false", newValue: "true" }), ro)).toMatchObject({
      kind: "urgency",
      text: "a marcat comanda ca urgentă",
      showActor: true,
    });
    expect(describeHistoryEntry(e({ field: "isPrio", oldValue: "true", newValue: "false" }), ro).text).toBe(
      "a scos marcajul de urgență",
    );
  });

  it("paid: by hand and online", () => {
    expect(describeHistoryEntry(e({ field: "isPaid", newValue: "true" }), ro)).toMatchObject({
      kind: "payment",
      text: "a marcat comanda ca achitată",
    });
    expect(
      describeHistoryEntry(e({ field: "isPaid", newValue: "true", metadata: { paymentProvider: "paynet" } }), ro).text,
    ).toBe("a achitat comanda online (Paynet)");
  });

  it("status change carries the codes for the chips", () => {
    const d = describeHistoryEntry(e({ action: "status_changed", field: "status", oldValue: "NEW", newValue: "IN_PROGRESS" }), ro);
    expect(d).toMatchObject({ kind: "status", text: "a schimbat statusul", status: { from: "NEW", to: "IN_PROGRESS", scope: "order" } });
    const derived = describeHistoryEntry(
      e({ action: "status_changed", oldValue: "SENT_TO_WORKSHOP", newValue: "WORKSHOP_READY", metadata: { derived: true } }),
      ro,
    );
    expect(derived.showActor).toBe(false);
    expect(derived.text).toBe("Statusul s-a schimbat singur, după poziții");
  });

  it("price set / changed", () => {
    expect(describeHistoryEntry(e({ field: "price", oldValue: null, newValue: "340" }), ro).text).toBe("a stabilit prețul: 340 lei");
    expect(describeHistoryEntry(e({ field: "price", oldValue: "340", newValue: "380.5" }), ro)).toMatchObject({
      kind: "price",
      text: "a schimbat prețul: 340 lei → 380.50 lei",
    });
  });

  it("created, files, trash", () => {
    expect(describeHistoryEntry(e({ action: "order_created" }), ro)).toMatchObject({ kind: "created", text: "a creat comanda" });
    expect(describeHistoryEntry(e({ action: "file_added", metadata: { fileName: "logo.pdf" } }), ro).text).toBe(
      "a adăugat fișierul logo.pdf",
    );
    expect(describeHistoryEntry(e({ action: "deleted" }), ro)).toMatchObject({ kind: "deleted", text: "a mutat comanda în coș" });
    expect(describeHistoryEntry(e({ action: "restored" }), ru).text).toBe("вернул(а) заказ из корзины");
  });

  it("order edit with a diff → summary line; old rows → plain «a modificat comanda»", () => {
    const withDiff = describeHistoryEntry(
      e({
        field: "order_structure",
        metadata: {
          changes: [
            { kind: "line_qty", name: "Căni", type: "mug", from: 10, to: 12 },
            { kind: "price", from: 340, to: 380 },
          ],
        },
      }),
      ro,
    );
    expect(withDiff).toMatchObject({ kind: "edit", text: "a modificat comanda", details: ["Căni: 10 → 12 buc · Preț: 340 → 380 lei"] });
    expect(describeHistoryEntry(e({ field: "order_structure", newValue: "updated" }), ro)).toMatchObject({
      text: "a modificat comanda",
      details: [],
    });
  });

  it("unknown actions / fields never show raw keys", () => {
    expect(describeHistoryEntry(e({ field: "someNewField", oldValue: "a", newValue: "b" }), ro).text).toBe("a modificat comanda");
    expect(describeHistoryEntry(e({ action: "weird_action" }), en).text).toBe("changed the order");
  });

  it("dealer edit: new rows use the diff, old rows the price", () => {
    expect(
      describeHistoryEntry(
        e({ action: "dealer_edited", field: "price", oldValue: "100", newValue: "120", metadata: { notesChanged: true } }),
        ro,
      ).details,
    ).toEqual(["Preț: 100 lei → 120 lei · notițe modificate"]);
    expect(
      describeHistoryEntry(
        e({ action: "dealer_edited", metadata: { changes: [{ kind: "line_added", name: null, type: "mug", qty: 3 }] } }),
        ro,
      ).details,
    ).toEqual([`+ ${ro.mug.productMug}, 3 buc`]);
  });

  it("line status, layout issue, dealer cancel", () => {
    expect(
      describeHistoryEntry(
        e({ action: "line_status_changed", oldValue: "WAITING", newValue: "PRINTING", metadata: { lineCode: "#9812.1/2" } }),
        ro,
      ),
    ).toMatchObject({ text: "a schimbat statusul poziției #9812.1/2", status: { scope: "line", from: "WAITING", to: "PRINTING" } });
    const flagged = describeHistoryEntry(
      e({ action: "line_layout_flagged", metadata: { lineCode: "#1.1/1", reason: "lowQuality", note: "prea mic" } }),
      ro,
    );
    expect(flagged.kind).toBe("problem");
    expect(flagged.details).toEqual(["„prea mic”"]);
    expect(describeHistoryEntry(e({ action: "cancelled_by_dealer", metadata: { reason: "dublură" } }), ro)).toMatchObject({
      kind: "cancelled",
      details: ["Motiv: dublură"],
    });
  });

  it("every action / field has a text in all three languages", () => {
    const rows: Partial<HistoryEntry>[] = [
      { action: "order_created" },
      { action: "status_changed", oldValue: "NEW", newValue: "DELIVERED" },
      ...["status", "isPrio", "isPaid", "price", "notes", "phone", "clientName", "clientId", "issueReason",
        "approval_feedback", "trackingNumber", "shippedAt", "order_structure"].map((field) => ({ field, newValue: "x" })),
      ...["line_status_changed", "line_layout_flagged", "line_layout_cleared", "line_layout_fixed", "line_file_replaced",
        "file_added", "file_removed", "file_updated", "deleted", "restored", "payment_mismatch", "dealer_edited",
        "cancelled_by_dealer", "urgency_dealer_on", "urgency_dealer_off", "urgency_staff_off", "urgency_fee_waived"].map(
        (action) => ({ action }),
      ),
    ];
    for (const dict of [ro, ru, en]) {
      for (const r of rows) {
        const text = describeHistoryEntry(e(r), dict).text;
        expect(text.length, `${r.action}/${r.field}`).toBeGreaterThan(0);
        expect(text).not.toMatch(/_|undefined|\[object/);
      }
    }
  });
});

describe("actor", () => {
  it("name + role in simple words", () => {
    expect(actorName(e({}), ro)).toBe("Vera");
    expect(actorRole(e({ userRole: "admin" }), ro)).toBe("studio");
    expect(actorRole(e({ userRole: "workshop" }), ro)).toBe("atelier");
    expect(actorRole(e({ userRole: "dealer" }), ru)).toBe("дилер");
  });
  it("anonymous client: «Clientul»-style name, no role in brackets", () => {
    expect(actorName(e({ userName: "Client", userRole: "client" }), ro)).toBe("Client");
    expect(actorRole(e({ userName: "Client", userRole: "client" }), ro)).toBeNull();
    expect(actorName(e({ userName: "Unknown", userRole: "unknown" }), en)).toBe("System");
  });
});

describe("noise + grouping", () => {
  const created = e({ action: "order_created", createdAt: "2026-11-08T10:00:00.000Z" });
  const structure = e({ field: "order_structure", newValue: "updated", createdAt: "2026-11-08T10:01:00.000Z" });

  it("empty order_structure right after creation by the same person is hidden", () => {
    expect(isNoiseEntry(structure, [structure, created])).toBe(true);
    expect(isNoiseEntry({ ...structure, userName: "Ana" }, [structure, created])).toBe(false);
    expect(isNoiseEntry({ ...structure, createdAt: "2026-11-08T10:05:00.000Z" }, [structure, created])).toBe(false);
    const withDiff = { ...structure, metadata: { changes: [{ kind: "notes" }] } };
    expect(isNoiseEntry(withDiff, [withDiff, created])).toBe(false);
    expect(visibleHistoryEntries([structure, created])).toEqual([created]);
  });

  it("day labels: today / yesterday / weekday + date", () => {
    const now = new Date(2026, 10, 8, 15, 0);
    expect(historyDayLabel(new Date(2026, 10, 8, 9, 0), "ro", ro, now)).toBe("Azi");
    expect(historyDayLabel(new Date(2026, 10, 7, 23, 0), "ru", ru, now)).toBe("Вчера");
    expect(historyDayLabel(new Date(2026, 10, 5, 12, 0), "en", en, now)).toMatch(/^Thursday/);
    expect(historyDayLabel(new Date(2025, 0, 2, 12, 0), "ro", ro, now)).toMatch(/2025/);
  });

  it("groups newest-first entries by local day", () => {
    const now = new Date(2026, 10, 8, 15, 0);
    const a = e({ createdAt: new Date(2026, 10, 8, 12, 0).toISOString() });
    const b = e({ createdAt: new Date(2026, 10, 8, 9, 0).toISOString() });
    const c = e({ createdAt: new Date(2026, 10, 7, 9, 0).toISOString() });
    const groups = groupHistoryByDay([a, b, c], "ro", ro, now);
    expect(groups.map((g) => [g.label, g.entries.length])).toEqual([
      ["Azi", 2],
      ["Ieri", 1],
    ]);
  });
});

describe("summary + status labels", () => {
  it("summarizes every change kind", () => {
    const s = summarizeOrderChanges(
      [
        { kind: "line_added", name: "Pix", type: "pen", qty: 50 },
        { kind: "line_removed", name: "Cană", type: "mug", qty: null },
        { kind: "line_product", name: "Cană neagră", type: "mug", fromName: "Cană albă" },
        { kind: "line_files", name: "Banner", type: "large_format_print" },
        { kind: "line_options", name: "Banner", type: "large_format_print" },
        { kind: "client", from: null, to: "SRL Alfa" },
        { kind: "phone", from: "1", to: "2" },
        { kind: "notes" },
      ],
      ro,
    );
    expect(s).toBe(
      "+ Pix, 50 buc · − Cană · Cană albă → Cană neagră · Banner: fișier nou · Banner: alte opțiuni · Client: — → SRL Alfa · Telefon: 1 → 2 · notițe modificate",
    );
  });
  it("status labels: order + line, unknown → null", () => {
    expect(historyStatusLabel("DELIVERED", "order", ro)).toBe(ro.statuses.DELIVERED);
    expect(historyStatusLabel("DONE", "line", ru)).toBe(ru.lineStatus.DONE);
    expect(historyStatusLabel("history", "line", ru)).toBeNull();
    expect(historyStatusLabel("CANCELLED_X", "order", ru)).toBeNull();
  });
});

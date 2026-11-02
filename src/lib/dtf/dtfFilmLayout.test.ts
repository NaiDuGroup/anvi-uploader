import { describe, expect, it } from "vitest";
import { groupLines, type RawOrder, type RawOrderLine } from "@/lib/workshopBoard/groupLines";
import { dtfZoneFilePaperType } from "./dtfConstants";
import { collectDtfFilmTransfers } from "./dtfFilmLayout";
import { pricedDtfLine } from "./dtfTestFixtures";
import type { DtfLineData } from "./types";

function dtfOrder(id: string, orderNumber: number, data: DtfLineData, withArtwork: boolean): RawOrder {
  const line: RawOrderLine = {
    id: `${id}-line`,
    sortOrder: 0,
    productType: "dtf_apparel",
    mugProductSnapshot: null,
    notebookProductSnapshot: null,
    penProductSnapshot: null,
    largeFormatLineData: null,
    dtfLineData: JSON.parse(JSON.stringify(data)) as unknown,
    files: [],
  };
  return {
    id,
    orderNumber,
    phone: "+37300000000",
    clientName: null,
    status: "SENT_TO_WORKSHOP",
    isPrio: false,
    unreadCommentCount: 0,
    commentCount: 0,
    createdAt: "2026-10-01T00:00:00.000Z",
    notes: null,
    orderLines: [line],
    files: withArtwork
      ? data.zones.map((z) => ({
          id: `${id}-file-${z.id}`,
          fileName: "logo.png",
          fileUrl: "/logo.png",
          copies: data.quantity,
          color: "color",
          paperType: dtfZoneFilePaperType(z.id),
          pageCount: null,
          orderLineId: line.id,
        }))
      : [],
    productType: "dtf_apparel",
    createdByName: null,
    sentToWorkshopByName: null,
  };
}

const FILM = { printableWidthCm: 32, gapCm: 1 };

describe("DTF on the workshop board", () => {
  it("puts DTF orders on one shared film card with the current film spec", () => {
    const sections = groupLines(
      [
        dtfOrder("a", 4665, pricedDtfLine({ M: 1 }), true),
        dtfOrder("b", 8628, pricedDtfLine({ S: 4, M: 5, L: 3 }), true),
      ],
      { dtfFilm: FILM },
    );
    expect(sections).toHaveLength(1);
    const [group] = sections[0]!.groups;
    expect(sections[0]!.productType).toBe("dtf_apparel");
    expect(group!.lines).toHaveLength(2);
    expect(group!.aggregate.totalQty).toBe(13);
    expect(group!.meta.dtfFilm).toEqual(FILM);
    const facts = group!.lines.find((l) => l.orderNumber === 8628)!.facts;
    if (facts.kind !== "dtf") throw new Error("expected DTF facts");
    const [transfer] = facts.data.transfers;
    expect(transfer!.fileId).toBe(`b-file-${transfer!.zoneId}`);
  });

  it("lists one A4 transfer per garment with its artwork", () => {
    const [section] = groupLines([dtfOrder("b", 8628, pricedDtfLine({ S: 4, M: 5, L: 3 }), true)], {
      dtfFilm: FILM,
    });
    const film = collectDtfFilmTransfers(section!.groups[0]!.lines);
    expect(film.transfers).toHaveLength(12);
    expect(new Set(film.transfers.map((t) => t.tileId)).size).toBe(12);
    expect(film.transfers.every((t) => t.fileId.startsWith("b-file-"))).toBe(true);
    expect(film.missingArtworkCount).toBe(0);
    expect(film.orderNumbers).toEqual([8628]);
  });

  it("counts transfers that still lack artwork", () => {
    const [section] = groupLines([dtfOrder("a", 4665, pricedDtfLine({ M: 2 }), false)], {
      dtfFilm: FILM,
    });
    const film = collectDtfFilmTransfers(section!.groups[0]!.lines);
    expect(film.transfers).toEqual([]);
    expect(film.missingArtworkCount).toBe(2);
  });
});

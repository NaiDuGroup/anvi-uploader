import { describe, expect, it } from "vitest";
import {
  canRemoveDtfZone,
  dtfRowZoneId,
  dtfZoneFileEntries,
  dtfZoneFileSpecs,
  dtfZoneFilesNeedUpload,
  reconcileDtfZoneFiles,
  type WizardDtfZoneFiles,
} from "./dtfZoneFiles";

const zones = [{ id: "z1" }, { id: "z2" }, { id: "z3" }];
const back = new File(["x"], "DTF_spate A3.png", { type: "image/png" });

describe("dtfRowZoneId", () => {
  it("takes the row's zone, then the stored tag, then the first zone", () => {
    expect(dtfRowZoneId(zones, "z3", "dtf:z2")).toBe("z3");
    expect(dtfRowZoneId(zones, "gone", "dtf:z2")).toBe("z2");
    expect(dtfRowZoneId(zones, null, "dtf:gone")).toBe("z1");
    expect(dtfRowZoneId([], null, null)).toBeNull();
  });
});

describe("dtfZoneFileEntries", () => {
  it("lists zone files in zone order, without the row zone, removed zones or empty entries", () => {
    const files: WizardDtfZoneFiles = {
      z3: { reuse: { fileName: "c.png", fileUrl: "library/c.png", source: "library", libraryFileId: "l1" } },
      z2: { file: back },
      z1: { file: back },
      gone: { file: back },
    };
    expect(dtfZoneFileEntries(zones, "z1", files).map((e) => e.zoneId)).toEqual(["z2", "z3"]);
    expect(dtfZoneFileEntries(zones, "z1", { z2: {} })).toEqual([]);
  });
});

describe("dtfZoneFileSpecs", () => {
  it("uploads fresh files and tags every file to its zone", async () => {
    const uploaded: string[] = [];
    const specs = await dtfZoneFileSpecs(
      zones,
      "z1",
      {
        z2: { file: back },
        z3: { existing: { id: "file-3", fileName: "c.png", paperType: "dtf:z3" } },
      },
      async (f) => {
        uploaded.push(f.name);
        return { fileName: f.name, fileUrl: `uploads/${f.name}` };
      },
    );
    expect(uploaded).toEqual(["DTF_spate A3.png"]);
    expect(specs).toEqual([
      { fileName: "DTF_spate A3.png", fileUrl: "uploads/DTF_spate A3.png", paperType: "dtf:z2" },
      { fileId: "file-3", paperType: "dtf:z3" },
    ]);
  });
});

describe("reconcileDtfZoneFiles", () => {
  it("drops files of removed zones", () => {
    const files: WizardDtfZoneFiles = { z2: { file: back }, z9: { file: back } };
    const r = reconcileDtfZoneFiles(zones, undefined, files);
    expect(Object.keys(r.dtfZoneFiles ?? {})).toEqual(["z2"]);
    expect(r.dtfRowZoneId).toBeUndefined();
  });

  it("returns the same objects when nothing changes", () => {
    const files: WizardDtfZoneFiles = { z2: { file: back } };
    const r = reconcileDtfZoneFiles(zones, "z1", files);
    expect(r.dtfZoneFiles).toBe(files);
    expect(r.dtfRowZoneId).toBe("z1");
  });

  it("moves the row file to a free zone when its zone was removed", () => {
    // Row zone z1 removed: z2 has its own file, so the row file goes to z3.
    const r = reconcileDtfZoneFiles([{ id: "z2" }, { id: "z3" }], "z1", { z2: { file: back } });
    expect(r.dtfRowZoneId).toBe("z3");
  });
});

describe("canRemoveDtfZone", () => {
  it("keeps the row zone when every other zone has its own file", () => {
    const two = [{ id: "z1" }, { id: "z2" }];
    expect(canRemoveDtfZone(two, "z1", { z2: { file: back } }, "z1")).toBe(false);
    expect(canRemoveDtfZone(two, "z1", { z2: { file: back } }, "z2")).toBe(true);
    expect(canRemoveDtfZone(two, "z1", {}, "z1")).toBe(true);
    expect(canRemoveDtfZone([{ id: "z1" }], "z1", {}, "z1")).toBe(false);
  });
});

describe("dtfZoneFilesNeedUpload", () => {
  it("is true only for a fresh file", () => {
    expect(dtfZoneFilesNeedUpload({ z2: { file: back } })).toBe(true);
    expect(dtfZoneFilesNeedUpload({ z2: { existing: { id: "a", fileName: "a", paperType: null } } })).toBe(false);
    expect(dtfZoneFilesNeedUpload(null)).toBe(false);
  });
});

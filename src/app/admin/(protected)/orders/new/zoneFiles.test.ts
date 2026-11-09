import { describe, expect, it } from "vitest";
import {
  canRemoveFileZone,
  rowZoneId,
  DTF_ZONE_FILE_TAG,
  UV_ZONE_FILE_TAG,
  zoneFileTagFor,
  zoneFileEntries,
  zoneFileSpecs,
  zoneFilesNeedUpload,
  reconcileZoneFiles,
  type WizardZoneFiles,
} from "./zoneFiles";

const zones = [{ id: "z1" }, { id: "z2" }, { id: "z3" }];
const back = new File(["x"], "DTF_spate A3.png", { type: "image/png" });

describe("rowZoneId", () => {
  it("takes the row's zone, then the stored tag, then the first zone", () => {
    expect(rowZoneId(zones, "z3", "dtf:z2", DTF_ZONE_FILE_TAG)).toBe("z3");
    expect(rowZoneId(zones, "gone", "dtf:z2", DTF_ZONE_FILE_TAG)).toBe("z2");
    expect(rowZoneId(zones, null, "dtf:gone", DTF_ZONE_FILE_TAG)).toBe("z1");
    expect(rowZoneId([], null, null, DTF_ZONE_FILE_TAG)).toBeNull();
    // UV reads its own tag only.
    expect(rowZoneId(zones, null, "uv:z2", UV_ZONE_FILE_TAG)).toBe("z2");
    expect(rowZoneId(zones, null, "dtf:z2", UV_ZONE_FILE_TAG)).toBe("z1");
  });
});

describe("zoneFileEntries", () => {
  it("lists zone files in zone order, without the row zone, removed zones or empty entries", () => {
    const files: WizardZoneFiles = {
      z3: { reuse: { fileName: "c.png", fileUrl: "library/c.png", source: "library", libraryFileId: "l1" } },
      z2: { file: back },
      z1: { file: back },
      gone: { file: back },
    };
    expect(zoneFileEntries(zones, "z1", files).map((e) => e.zoneId)).toEqual(["z2", "z3"]);
    expect(zoneFileEntries(zones, "z1", { z2: {} })).toEqual([]);
  });
});

describe("zoneFileSpecs", () => {
  it("uploads fresh files and tags every file to its zone", async () => {
    const uploaded: string[] = [];
    const specs = await zoneFileSpecs(
      zones,
      "z1",
      {
        z2: { file: back },
        z3: { existing: { id: "file-3", fileName: "c.png", paperType: "dtf:z3" } },
      },
      DTF_ZONE_FILE_TAG,
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

describe("reconcileZoneFiles", () => {
  it("drops files of removed zones", () => {
    const files: WizardZoneFiles = { z2: { file: back }, z9: { file: back } };
    const r = reconcileZoneFiles(zones, undefined, files);
    expect(Object.keys(r.zoneFiles ?? {})).toEqual(["z2"]);
    expect(r.rowZoneId).toBeUndefined();
  });

  it("returns the same objects when nothing changes", () => {
    const files: WizardZoneFiles = { z2: { file: back } };
    const r = reconcileZoneFiles(zones, "z1", files);
    expect(r.zoneFiles).toBe(files);
    expect(r.rowZoneId).toBe("z1");
  });

  it("moves the row file to a free zone when its zone was removed", () => {
    // Row zone z1 removed: z2 has its own file, so the row file goes to z3.
    const r = reconcileZoneFiles([{ id: "z2" }, { id: "z3" }], "z1", { z2: { file: back } });
    expect(r.rowZoneId).toBe("z3");
  });
});

describe("canRemoveFileZone", () => {
  it("keeps the row zone when every other zone has its own file", () => {
    const two = [{ id: "z1" }, { id: "z2" }];
    expect(canRemoveFileZone(two, "z1", { z2: { file: back } }, "z1")).toBe(false);
    expect(canRemoveFileZone(two, "z1", { z2: { file: back } }, "z2")).toBe(true);
    expect(canRemoveFileZone(two, "z1", {}, "z1")).toBe(true);
    expect(canRemoveFileZone([{ id: "z1" }], "z1", {}, "z1")).toBe(false);
  });
});

describe("zoneFilesNeedUpload", () => {
  it("is true only for a fresh file", () => {
    expect(zoneFilesNeedUpload({ z2: { file: back } })).toBe(true);
    expect(zoneFilesNeedUpload({ z2: { existing: { id: "a", fileName: "a", paperType: null } } })).toBe(false);
    expect(zoneFilesNeedUpload(null)).toBe(false);
  });
});

describe("zoneFileTagFor", () => {
  it("tags DTF and UV zone files, nothing else", () => {
    expect(zoneFileTagFor("dtf_apparel")?.paperType("z1")).toBe("dtf:z1");
    expect(zoneFileTagFor("uv_print")?.paperType("z1")).toBe("uv:z1");
    expect(zoneFileTagFor("paper_print")).toBeNull();
  });

  it("UV zone files are tagged uv:<zoneId>", async () => {
    const specs = await zoneFileSpecs(
      zones,
      "z1",
      { z2: { existing: { id: "file-2", fileName: "spate.png", paperType: null } } },
      UV_ZONE_FILE_TAG,
      async () => {
        throw new Error("no upload");
      },
    );
    expect(specs).toEqual([{ fileId: "file-2", paperType: "uv:z2" }]);
  });
});

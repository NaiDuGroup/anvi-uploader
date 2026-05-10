import * as THREE from "three";

/**
 * Hardcover A5 notebook GLB.
 * Mesh names (extracted from the file): `cover_A5`, `strap_A5`, `bookmark_A5`,
 * `headband_A5`, `paper_A5`.
 *
 * - `cover_A5` — single hardcover sheet (front + spine + back). Receives the
 *   client's print as a UV-mapped texture overlay.
 * - `strap_A5` — elastic closure band (admin-controlled color).
 * - `bookmark_A5` — sewn-in ribbon bookmark (admin-controlled color).
 * - `headband_A5` / `paper_A5` — left at default neutral colors.
 *
 * The asset is ~21 MB so it lives in R2/CDN, not in the repo. Set
 * `NEXT_PUBLIC_NOTEBOOK_GLB_URL` (e.g. `https://cdn.example.com/...glb`) on
 * production. In dev we fall back to the local `public/` path so contributors
 * who keep the file checked out locally don't need any extra config.
 */
const FALLBACK_NOTEBOOK_GLB_URL =
  "/notebook_hardcover_with_strap_A5_v3.1_Cycles.glb";

export const NOTEBOOK_GLB_URL: string =
  process.env.NEXT_PUBLIC_NOTEBOOK_GLB_URL?.trim() || FALLBACK_NOTEBOOK_GLB_URL;

export const NOTEBOOK_MESH_COVER = "cover_A5";
export const NOTEBOOK_MESH_STRAP = "strap_A5";
export const NOTEBOOK_MESH_BOOKMARK = "bookmark_A5";
export const NOTEBOOK_MESH_HEADBAND = "headband_A5";
export const NOTEBOOK_MESH_PAPER = "paper_A5";

export const DEFAULT_NOTEBOOK_COVER_COLOR_HEX = "#1f1f1f";
export const DEFAULT_NOTEBOOK_STRAP_COLOR_HEX = "#1f1f1f";
export const DEFAULT_NOTEBOOK_BOOKMARK_COLOR_HEX = "#c0392b";

const PAPER_COLOR_HEX = "#fafaf7";
const HEADBAND_COLOR_HEX = "#d6c89a";

export const NOTEBOOK_COVER_PRESET_HEXES = [
  "#1f1f1f",
  "#7f1d1d",
  "#1e3a8a",
  "#0f766e",
  "#a16207",
  "#f5f5f0",
] as const;

export interface NotebookMaterialOptions {
  coverColorHex: string;
  strapColorHex: string;
  bookmarkColorHex: string;
  /**
   * Optional canvas-rendered print to overlay across the front cover region of `cover_A5`.
   * If provided, the cover mesh keeps its tinted color where the print is transparent.
   */
  coverPrintTexture?: THREE.Texture | null;
}

/**
 * Assigns non-shared materials so each notebook part can have its own color.
 * If `coverPrintTexture` is provided, the cover material uses it as a `map` (UV-driven).
 */
export function applyNotebookMaterials(
  root: THREE.Object3D,
  options: NotebookMaterialOptions,
): void {
  const coverColor = new THREE.Color(options.coverColorHex);
  const strapColor = new THREE.Color(options.strapColorHex);
  const bookmarkColor = new THREE.Color(options.bookmarkColorHex);
  const paperColor = new THREE.Color(PAPER_COLOR_HEX);
  const headbandColor = new THREE.Color(HEADBAND_COLOR_HEX);

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    if (child.name === NOTEBOOK_MESH_COVER) {
      const tex = options.coverPrintTexture ?? null;
      if (tex) {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
      }
      child.material = new THREE.MeshStandardMaterial({
        color: tex ? new THREE.Color("#ffffff") : coverColor,
        map: tex,
        roughness: 0.55,
        metalness: 0.05,
      });
      return;
    }
    if (child.name === NOTEBOOK_MESH_STRAP) {
      child.material = new THREE.MeshStandardMaterial({
        color: strapColor,
        roughness: 0.85,
        metalness: 0.0,
        // Bias the strap's depth values toward the camera so the print overlay
        // (a thin transparent plane sitting just above `cover_A5`) always loses
        // the depth-test where strap fragments were rasterised — the strap then
        // visually covers the print, like a real elastic over a real notebook.
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      });
      return;
    }
    if (child.name === NOTEBOOK_MESH_BOOKMARK) {
      child.material = new THREE.MeshStandardMaterial({
        color: bookmarkColor,
        roughness: 0.7,
        metalness: 0.0,
      });
      return;
    }
    if (child.name === NOTEBOOK_MESH_HEADBAND) {
      child.material = new THREE.MeshStandardMaterial({
        color: headbandColor,
        roughness: 0.6,
        metalness: 0.0,
      });
      return;
    }
    if (child.name === NOTEBOOK_MESH_PAPER) {
      child.material = new THREE.MeshStandardMaterial({
        color: paperColor,
        roughness: 0.95,
        metalness: 0.0,
      });
      return;
    }

    child.material = new THREE.MeshStandardMaterial({
      color: coverColor,
      roughness: 0.55,
      metalness: 0.05,
    });
  });
}

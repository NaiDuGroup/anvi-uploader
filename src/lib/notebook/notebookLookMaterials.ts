import * as THREE from "three";
import type { NotebookLook } from "./notebookLook";
import { GRAIN_TILE_CM, grainNormalMap, type GrainKind } from "@/lib/three/surfaceTextures";
import {
  NB_MESH_BOOKMARK,
  NB_MESH_COVER,
  NB_MESH_FRONT,
  NB_MESH_PAPER,
  NB_MESH_PEN,
  NB_MESH_PEN_LOOP,
  NB_MESH_PEN_TIP,
  NB_MESH_PEN_WHITE,
  NB_MESH_STICKY,
  NB_MESH_STRAP,
  NB_MESH_WIRE,
  NOTEBOOK_UNIT_PER_CM,
  type BuiltNotebook,
} from "./notebookGeometry";

/** Surface grain of a cover finish and how strongly it shows. */
export function notebookCoverGrain(finish: NotebookLook["finish"]): { kind: GrainKind; scale: number } {
  return finish === "leather" ? { kind: "leather", scale: 0.55 } : { kind: "cardboard", scale: 0.3 };
}

/** Grain normal map for the covers: their UVs are in scene units (extruded shape coordinates). */
function coverGrain(look: NotebookLook): { map: THREE.Texture; scale: THREE.Vector2 } {
  const g = notebookCoverGrain(look.finish);
  const r = 1 / (GRAIN_TILE_CM[g.kind] * NOTEBOOK_UNIT_PER_CM);
  return { map: grainNormalMap(g.kind, r, r), scale: new THREE.Vector2(g.scale, g.scale) };
}

/**
 * Materials for the procedural notebook (`buildNotebook`). The front cover
 * gets a small shader: the accent zone (cork lower part, kraft strip at the
 * binding) is coloured — and for cork speckled — from notebook-space position.
 */

const PAPER_HEX = "#f7f6f1";
const PEN_TIP_HEX = "#c9ccd1";

const FINISH: Record<NotebookLook["finish"], { roughness: number; sheen: number; clearcoat: number }> = {
  // A soft sheen in the cover's own colour: a white sheen washed dark covers out to pastel.
  leather: { roughness: 0.6, sheen: 0.25, clearcoat: 0.1 },
  matte: { roughness: 0.92, sheen: 0, clearcoat: 0 },
};

export type NotebookLookMaterialOptions = {
  coverColorHex: string;
  strapColorHex: string;
  bookmarkColorHex: string;
  look: NotebookLook;
  accent: BuiltNotebook["accent"];
};

function coverMaterial(colorHex: string, look: NotebookLook, accent: BuiltNotebook["accent"]): THREE.MeshPhysicalMaterial {
  const f = FINISH[look.finish];
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(colorHex),
    roughness: f.roughness,
    metalness: 0,
    sheen: f.sheen,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color(colorHex),
    clearcoat: f.clearcoat,
    clearcoatRoughness: 0.5,
  });
  const grain = coverGrain(look);
  mat.normalMap = grain.map;
  mat.normalScale = grain.scale;
  if (!accent) return mat;
  const uniforms = {
    uAccentAxis: { value: accent.axis === "x" ? 0 : 1 },
    uAccentFrom: { value: accent.from },
    uAccentColor: { value: new THREE.Color(look.accentColorHex) },
    uAccentCork: { value: look.accentTexture === "cork" ? 1 : 0 },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vNbPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvNbPos = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vNbPos;
uniform float uAccentAxis;
uniform float uAccentFrom;
uniform vec3 uAccentColor;
uniform float uAccentCork;
float nbHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float nbNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(nbHash(i), nbHash(i + vec2(1.0, 0.0)), f.x), mix(nbHash(i + vec2(0.0, 1.0)), nbHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
/** Cellular noise: x = distance to the nearest cell centre, y = to the second, z = that cell's random value. */
vec3 nbCells(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  float v = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 c = o + vec2(nbHash(i + o), nbHash(i + o + 19.7)) - f;
      float d = length(c);
      if (d < d1) { d2 = d1; d1 = d; v = nbHash(i + o + 5.3); }
      else if (d < d2) { d2 = d; }
    }
  }
  return vec3(d1, d2, v);
}
bool nbInAccent() {
  // −X is the binding: the strip accent is where x is below the edge; the bottom accent where z is past it.
  return uAccentAxis < 0.5 ? vNbPos.x < uAccentFrom : vNbPos.z > uAccentFrom;
}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  if (nbInAccent()) {
    vec3 c = uAccentColor;
    if (uAccentCork > 0.5) {
      // Natural cork: pressed granules of 2–6 mm, each its own shade, with darker
      // seams between them (cellular noise in two sizes) and small dark pores.
      vec2 p = vNbPos.xz * 100.0; // cm
      vec3 g1 = nbCells(p * 1.7);
      vec3 g2 = nbCells(p * 3.6 + 13.0);
      float tone = mix(g1.z, g2.z, 0.45);
      c *= mix(0.72, 1.28, tone);
      float seam = 1.0 - smoothstep(0.0, 0.12, min(g1.y - g1.x, (g2.y - g2.x) * 1.4));
      c *= 1.0 - seam * 0.18;
      c *= 0.92 + 0.16 * nbNoise(p * 30.0);
      // Irregular dark flecks, not a grid of dots.
      float pore = smoothstep(0.8, 0.9, nbNoise(p * 11.0 + g1.z * 9.0)) * smoothstep(0.45, 0.6, nbNoise(p * 3.0 + 4.0));
      c = mix(c, c * 0.45, pore * 0.8);
    }
    diffuseColor.rgb = c;
  }
}`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        "#include <roughnessmap_fragment>\nif (nbInAccent() && uAccentCork > 0.5) roughnessFactor = 0.95;",
      );
  };
  mat.customProgramCacheKey = () => "nb-cover-accent-v3";
  return mat;
}

export function applyNotebookLookMaterials(root: THREE.Object3D, o: NotebookLookMaterialOptions): void {
  const f = FINISH[o.look.finish];
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    switch (child.name) {
      case NB_MESH_FRONT:
        child.material = coverMaterial(o.coverColorHex, o.look, o.accent);
        return;
      case NB_MESH_COVER: {
        const grain = coverGrain(o.look);
        child.material = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(o.coverColorHex),
          roughness: f.roughness,
          sheen: f.sheen,
          sheenRoughness: 0.6,
          sheenColor: new THREE.Color(o.coverColorHex),
          clearcoat: f.clearcoat,
          clearcoatRoughness: 0.5,
          normalMap: grain.map,
          normalScale: grain.scale,
        });
        return;
      }
      case NB_MESH_PAPER:
        child.material = new THREE.MeshStandardMaterial({ color: PAPER_HEX, roughness: 0.95 });
        return;
      case NB_MESH_STRAP:
        child.material = new THREE.MeshStandardMaterial({ color: o.strapColorHex, roughness: 0.8 });
        return;
      case NB_MESH_BOOKMARK:
        child.material = new THREE.MeshStandardMaterial({ color: o.bookmarkColorHex, roughness: 0.6 });
        return;
      case NB_MESH_WIRE:
        child.material = new THREE.MeshStandardMaterial({ color: o.look.wireColorHex, roughness: 0.3, metalness: 0.7 });
        return;
      case NB_MESH_PEN:
        child.material = new THREE.MeshPhysicalMaterial({ color: o.look.penColorHex, roughness: 0.35, clearcoat: 0.5 });
        return;
      case NB_MESH_PEN_WHITE:
        child.material = new THREE.MeshPhysicalMaterial({ color: "#f4f4f2", roughness: 0.35, clearcoat: 0.4 });
        return;
      case NB_MESH_PEN_LOOP:
        child.material = new THREE.MeshStandardMaterial({ color: "#1b1b1b", roughness: 0.85 });
        return;
      case NB_MESH_STICKY:
        child.material = new THREE.MeshStandardMaterial({ color: (child.userData.colorHex as string) ?? "#f1e3a0", roughness: 0.7 });
        return;
      case NB_MESH_PEN_TIP:
        child.material = new THREE.MeshStandardMaterial({ color: PEN_TIP_HEX, roughness: 0.25, metalness: 0.8 });
        return;
      default:
        child.material = new THREE.MeshStandardMaterial({ color: o.coverColorHex, roughness: f.roughness });
    }
  });
}

export function disposeNotebookMaterials(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const m = child.material as THREE.Material | THREE.Material[];
      (Array.isArray(m) ? m : [m]).forEach((x) => {
        (x as THREE.MeshStandardMaterial).normalMap?.dispose();
        x.dispose();
      });
      child.geometry.dispose();
    }
  });
}

import * as THREE from "three";
import type { NotebookLook } from "./notebookLook";
import {
  NB_MESH_BOOKMARK,
  NB_MESH_COVER,
  NB_MESH_FRONT,
  NB_MESH_PAPER,
  NB_MESH_PEN,
  NB_MESH_PEN_TIP,
  NB_MESH_STRAP,
  NB_MESH_WIRE,
  type BuiltNotebook,
} from "./notebookGeometry";

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
float nbHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  // −X is the binding: the strip accent is where x is below the edge; the bottom accent where z is past it.
  bool inAccent = uAccentAxis < 0.5 ? vNbPos.x < uAccentFrom : vNbPos.z > uAccentFrom;
  if (inAccent) {
    vec3 c = uAccentColor;
    if (uAccentCork > 0.5) {
      // Cork: grains of ~1–2 mm in two sizes, darker and lighter than the base.
      vec2 p = vNbPos.xz * 900.0;
      float n = nbHash(floor(p)) * 0.6 + nbHash(floor(p * 0.37)) * 0.4;
      c *= mix(0.72, 1.18, n);
    }
    diffuseColor.rgb = c;
  }
}`,
      );
  };
  mat.customProgramCacheKey = () => "nb-cover-accent-v1";
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
      case NB_MESH_COVER:
        child.material = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(o.coverColorHex),
          roughness: f.roughness,
          sheen: f.sheen,
          sheenRoughness: 0.6,
          clearcoat: f.clearcoat,
          clearcoatRoughness: 0.5,
        });
        return;
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
      (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
      child.geometry.dispose();
    }
  });
}

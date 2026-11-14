"use client";

/**
 * Previzualizare: the 3D T-shirt (CLO model) in the shirt's colour with every
 * design painted on its panels where it sits on the editor's photo.
 * Drag to turn it all the way round.
 */
import { Suspense, useEffect, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { applyStudioEnvironment } from "@/lib/tshirt/mannequin3d";
import { MODEL_HPS_Y, TEXTURE_PX_PER_MM, TSHIRT_3D_URL, designOnPattern, type Panel } from "@/lib/tshirt/tshirt3d";
import type { TshirtSide } from "@/lib/tshirt/tshirtRules";

export type Print3D = { canvas: HTMLCanvasElement; rect: { x: number; y: number; w: number; h: number } };

type Props = {
  shirtColor: string;
  /** The shown size's shirt against the model: across / lengthwise. */
  sx: number;
  sy: number;
  /** Sleeve print square's top under the shoulder seam on the shown size (cm). */
  sleeveTopCm: number;
  prints: Partial<Record<TshirtSide, Print3D>>;
  hint: string;
  /** Shown: draws continuously; hidden (kept loaded behind the editor): draws nothing. */
  active?: boolean;
};

/** The panel a mesh belongs to (by its node name; the sleeves by their side). */
function panelOfMesh(m: THREE.Mesh): Panel | null {
  let o: THREE.Object3D | null = m;
  while (o) {
    const n = o.name;
    if (n.startsWith("Body_Front")) return "front";
    if (n.startsWith("Body_Back")) return "back";
    if (n.startsWith("Ribbing")) return "rib";
    if (n.startsWith("Sleeves")) {
      m.geometry.computeBoundingBox();
      return (m.geometry.boundingBox!.max.x + m.geometry.boundingBox!.min.x) / 2 > 0 ? "sleeve_left" : "sleeve_right";
    }
    o = o.parent;
  }
  return null;
}

/** A panel's texture: the cloth colour and the prints, in pattern mm (`uv` box). */
function panelTexture(panel: Panel, uv: THREE.Box2, color: string, prints: Props["prints"], sx: number, sy: number, sleeveTopCm: number): THREE.CanvasTexture {
  const k = TEXTURE_PX_PER_MM;
  const c = document.createElement("canvas");
  c.width = Math.max(4, Math.ceil((uv.max.x - uv.min.x) * k));
  c.height = Math.max(4, Math.ceil((uv.max.y - uv.min.y) * k));
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  if (panel !== "rib") {
    const p = prints[panel];
    if (p) {
      const at = designOnPattern(panel, p.rect, sx, sy, sleeveTopCm);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(p.canvas, (at.u - uv.min.x) * k, (at.v - uv.min.y) * k, at.w * k, at.h * k);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function Shirt({ shirtColor, sx, sy, sleeveTopCm, prints }: Omit<Props, "hint" | "active">) {
  const gltf = useGLTF(TSHIRT_3D_URL);
  const gl = useThree((st) => st.gl);
  const scene = useThree((st) => st.scene);
  useEffect(() => applyStudioEnvironment(gl, scene), [gl, scene]);

  // The model once, its texture coordinates turned from pattern mm into 0..1 per panel (kept: the box).
  const model = useMemo(() => {
    const root = gltf.scene.clone(true);
    const meshes: { mesh: THREE.Mesh; panel: Panel; uv: THREE.Box2; inner: boolean }[] = [];
    const seen = new Map<THREE.Object3D, number>();
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const panel = panelOfMesh(m);
      if (!panel) return;
      m.geometry = m.geometry.clone();
      const uvAttr = m.geometry.getAttribute("uv") as THREE.BufferAttribute;
      const box = new THREE.Box2();
      for (let i = 0; i < uvAttr.count; i++) box.expandByPoint(new THREE.Vector2(uvAttr.getX(i), uvAttr.getY(i)));
      for (let i = 0; i < uvAttr.count; i++) {
        uvAttr.setXY(i, (uvAttr.getX(i) - box.min.x) / (box.max.x - box.min.x), 1 - (uvAttr.getY(i) - box.min.y) / (box.max.y - box.min.y));
      }
      uvAttr.needsUpdate = true;
      // CLO exports each panel as outer face, inner face, edge: only the outer face carries the print.
      const parent = m.parent ?? root;
      const idx = seen.get(parent) ?? 0;
      seen.set(parent, idx + 1);
      meshes.push({ mesh: m, panel, uv: box, inner: idx > 0 });
    });
    return { root, meshes };
  }, [gltf]);

  useEffect(() => {
    const disposables: { dispose(): void }[] = [];
    const cloth = new THREE.Color(shirtColor);
    const dark = cloth.getHSL({ h: 0, s: 0, l: 0 }).l < 0.35;
    const inner = new THREE.MeshPhysicalMaterial({
      color: cloth.clone().multiplyScalar(0.86),
      roughness: 0.95,
      sheen: 0.6,
      sheenRoughness: 0.8,
      sheenColor: new THREE.Color(dark ? "#555555" : "#ffffff"),
      side: THREE.DoubleSide,
    });
    disposables.push(inner);
    const textures = new Map<Panel, THREE.CanvasTexture>();
    for (const { mesh, panel, uv, inner: isInner } of model.meshes) {
      if (isInner) {
        mesh.material = inner;
        continue;
      }
      let tex = textures.get(panel);
      if (!tex) {
        tex = panelTexture(panel, uv, shirtColor, prints, sx, sy, sleeveTopCm);
        textures.set(panel, tex);
        disposables.push(tex);
      }
      const mat = new THREE.MeshPhysicalMaterial({
        map: tex,
        roughness: 0.92,
        sheen: 0.45,
        sheenRoughness: 0.75,
        sheenColor: new THREE.Color(dark ? "#4a4a4a" : "#ffffff"),
        side: THREE.FrontSide,
      });
      disposables.push(mat);
      mesh.material = mat;
    }
    return () => disposables.forEach((d) => d.dispose());
  }, [model, shirtColor, prints, sx, sy, sleeveTopCm]);

  // The shirt at the shown size's real chest and length, resized around the collar (the HPS stays put).
  return (
    <group scale={[sx, sy, sx]} position={[0, MODEL_HPS_Y * (1 - sy), 0]}>
      <primitive object={model.root} />
    </group>
  );
}

export function TshirtModel3D({ shirtColor, sx, sy, sleeveTopCm, prints, hint, active = true }: Props) {
  return (
    <div className="relative h-full w-full" style={{ background: "radial-gradient(circle at 50% 35%, #ffffff 0%, #eef0f3 60%, #dfe3e8 100%)" }}>
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 1.3, 1.6], fov: 30, near: 0.1, far: 20 }}
        frameloop={active ? "always" : "never"}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        style={{ position: "absolute", inset: 0, touchAction: "none", cursor: "grab" }}
        data-tshirt-3d
      >
        <ambientLight intensity={0.35} />
        <directionalLight position={[1.5, 2.6, 2.2]} intensity={1.6} />
        <directionalLight position={[-2, 1.6, -1.5]} intensity={0.6} />
        <Suspense fallback={null}>
          <Shirt shirtColor={shirtColor} sx={sx} sy={sy} sleeveTopCm={sleeveTopCm} prints={prints} />
        </Suspense>
        <ContactShadows position={[0, 0.9, 0]} opacity={0.35} scale={1.6} blur={2.6} far={0.6} resolution={512} frames={1} />
        <OrbitControls target={[0, 1.29, 0]} enablePan={false} enableZoom={false} enableDamping dampingFactor={0.1} rotateSpeed={0.8} minPolarAngle={Math.PI / 2 - 0.35} maxPolarAngle={Math.PI / 2 + 0.25} />
      </Canvas>
      <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-gray-600 shadow-sm">{hint}</span>
    </div>
  );
}

useGLTF.preload(TSHIRT_3D_URL);

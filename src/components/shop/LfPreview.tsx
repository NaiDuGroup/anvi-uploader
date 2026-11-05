"use client";

import { useId } from "react";
import type { LfEdge, LfEyeletPoint } from "@/lib/largeFormat/lfFinishing";

/**
 * Wide-format preview, drawn to scale in centimetres: the artwork cropped to
 * the ordered size, the safe zone, and per product the canvas wrap (mirrored
 * sides and the fold line), the banner's eyelets and pockets, or the part of
 * a roll-up that goes into the cassette.
 */
export function LfPreview({
  widthCm,
  heightCm,
  imageUrl,
  safeCm,
  wrapCm = 0,
  eyelets = [],
  pockets = [],
  pocketDepthCm = 5,
  hiddenBottomCm = 0,
  emptyText,
  label,
}: {
  /** Visible size (canvas: the face). */
  widthCm: number;
  heightCm: number;
  imageUrl: string | null;
  safeCm: number;
  wrapCm?: number;
  eyelets?: LfEyeletPoint[];
  pockets?: LfEdge[];
  pocketDepthCm?: number;
  hiddenBottomCm?: number;
  emptyText: string;
  label: string;
}) {
  const uid = useId().replace(/:/g, "");
  const W: number = widthCm + 2 * wrapCm;
  const H: number = heightCm + 2 * wrapCm;
  const unit: number = Math.max(W, H) / 100;
  const face = { x: wrapCm, y: wrapCm, w: widthCm, h: heightCm };
  const safe = Math.min(safeCm, widthCm / 4, heightCm / 4);
  const stroke: number = Math.max(0.15, unit * 0.45);
  const dash = `${unit * 2} ${unit * 1.4}`;
  const img = (key: string) =>
    imageUrl ? (
      <image key={key} href={imageUrl} x={face.x} y={face.y} width={face.w} height={face.h} preserveAspectRatio="xMidYMid slice" />
    ) : null;
  // Mirrored copies of the face on the wrapped sides (as the workshop builds them).
  const mirrors = wrapCm > 0 && imageUrl
    ? [
        { id: "l", clip: { x: 0, y: wrapCm, w: wrapCm, h: heightCm }, t: `translate(${2 * wrapCm} 0) scale(-1 1)` },
        { id: "r", clip: { x: wrapCm + widthCm, y: wrapCm, w: wrapCm, h: heightCm }, t: `translate(${2 * (wrapCm + widthCm)} 0) scale(-1 1)` },
        { id: "t", clip: { x: wrapCm, y: 0, w: widthCm, h: wrapCm }, t: `translate(0 ${2 * wrapCm}) scale(1 -1)` },
        { id: "b", clip: { x: wrapCm, y: wrapCm + heightCm, w: widthCm, h: wrapCm }, t: `translate(0 ${2 * (wrapCm + heightCm)}) scale(1 -1)` },
      ]
    : [];
  const pocketRect = (e: LfEdge) => {
    const d = Math.min(pocketDepthCm, (e === "top" || e === "bottom" ? heightCm : widthCm) / 4);
    if (e === "top") return { x: face.x, y: face.y, w: face.w, h: d };
    if (e === "bottom") return { x: face.x, y: face.y + face.h - d, w: face.w, h: d };
    if (e === "left") return { x: face.x, y: face.y, w: d, h: face.h };
    return { x: face.x + face.w - d, y: face.y, w: d, h: face.h };
  };
  const r: number = Math.max(0.8, unit * 1.3);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
      className="block h-auto max-h-[62vh] w-full rounded-md border border-(--line2) bg-[#f4f1ea] shadow-sm"
    >
      <defs>
        {mirrors.map((m) => (
          <clipPath key={m.id} id={`${uid}-${m.id}`}>
            <rect x={m.clip.x} y={m.clip.y} width={m.clip.w} height={m.clip.h} />
          </clipPath>
        ))}
        <pattern id={`${uid}-hatch`} width={unit * 3} height={unit * 3} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={unit * 3} height={unit * 3} fill="rgba(31,41,55,.35)" />
          <line x1="0" y1="0" x2="0" y2={unit * 3} stroke="rgba(255,255,255,.7)" strokeWidth={unit * 1.2} />
        </pattern>
      </defs>
      <rect x={face.x} y={face.y} width={face.w} height={face.h} fill="#fff" />
      {img("face")}
      {mirrors.map((m) => (
        <g key={m.id} clipPath={`url(#${uid}-${m.id})`}>
          <g transform={m.t}>{img(`m-${m.id}`)}</g>
        </g>
      ))}
      {!imageUrl ? (
        <text
          x={face.x + face.w / 2}
          y={face.y + face.h / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={Math.max(Math.min(unit * 4, face.w / 14), 0.8)}
          fill="#6b7280"
        >
          {emptyText}
        </text>
      ) : null}
      {wrapCm > 0 ? (
        <>
          {/* The sides that fold around the frame: lighter, with the fold line. */}
          <path
            fillRule="evenodd"
            d={`M0 0H${W}V${H}H0Z M${face.x} ${face.y}V${face.y + face.h}H${face.x + face.w}V${face.y}Z`}
            fill="rgba(255,255,255,.45)"
          />
          <rect x={face.x} y={face.y} width={face.w} height={face.h} fill="none" stroke="#e11d48" strokeWidth={stroke} />
        </>
      ) : null}
      {pockets.map((e) => {
        const p = pocketRect(e);
        return <rect key={e} x={p.x} y={p.y} width={p.w} height={p.h} fill={`url(#${uid}-hatch)`} />;
      })}
      {hiddenBottomCm > 0 ? (
        <rect x={face.x} y={face.y + face.h - hiddenBottomCm} width={face.w} height={hiddenBottomCm} fill={`url(#${uid}-hatch)`} />
      ) : null}
      <rect
        x={face.x + safe}
        y={face.y + safe}
        width={Math.max(0, face.w - 2 * safe)}
        height={Math.max(0, face.h - 2 * safe - hiddenBottomCm)}
        fill="none"
        stroke="#2563eb"
        strokeWidth={stroke}
        strokeDasharray={dash}
      />
      {eyelets.map((p, i) => (
        <circle key={i} cx={face.x + p.xCm} cy={face.y + p.yCm} r={r} fill="#fff" stroke="#111827" strokeWidth={stroke * 1.4} />
      ))}
    </svg>
  );
}

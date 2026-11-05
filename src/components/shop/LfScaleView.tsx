"use client";

import { useId } from "react";
import type { ShopLfProduct } from "@/lib/storefront/largeFormat";
import { lfScaleScene } from "@/lib/storefront/lfVisual";

const INK = "#14213d";
const GOLD = "#cdac21";

/**
 * A neutral standing figure, 170 cm tall and 47 cm wide (same units as the
 * scene): head + one outline for body, arms and legs, symmetric about x = 23.
 */
const PERSON_PATH =
  "M17 24L29 24L29 28C36 29 41 31 42 37L45 62L46 90C46.5 95 44 97 42 95L40.5 66L39 48L38 80L39 92L37 130L36 164C36 168 38 169 39 170" +
  "L25.5 170L25 164L24 100L23 96L22 100L21 164L20.5 170L7 170C8 169 10 168 10 164L9 130L7 92L8 80L7 48L5.5 66L4 95C2 97 -0.5 95 0 90" +
  "L1 62L4 37C5 31 10 29 17 28Z";

/**
 * «Real size»: the product drawn to scale next to a 170 cm person (banners
 * and films hanging, posters and canvases on a wall at ~150 cm, roll-ups and
 * X-banners on their stands), with the size labels. The whole scene scales
 * to fit; the person stays in proportion.
 */
export function LfScaleView({
  product,
  widthCm,
  heightCm,
  imageUrl,
  sizeText,
  caption,
  label,
}: {
  product: ShopLfProduct;
  /** Visible size, cm (roll-up: the visible part, not the print). */
  widthCm: number;
  heightCm: number;
  imageUrl: string | null;
  /** «200 × 100 см». */
  sizeText: { width: string; height: string };
  caption: string;
  label: string;
}) {
  const uid = useId().replace(/:/g, "");
  const s = lfScaleScene(product, widthCm, heightCm);
  const p = s.product;
  const stroke: number = Math.max(0.6, s.fontCm * 0.08);
  const poleW: number = Math.max(1.4, s.fontCm * 0.16);
  return (
    <figure className="m-0 flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${s.width} ${s.height}`}
        role="img"
        aria-label={label}
        className="block max-h-[min(62vh,420px)] w-full rounded-md border border-(--line2) bg-white"
        style={{ aspectRatio: `${s.width} / ${s.height}` }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id={`${uid}-wall`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#f3f1ea" />
          </linearGradient>
          <clipPath id={`${uid}-clip`}>
            <rect x={p.x} y={p.y} width={p.w} height={p.h} />
          </clipPath>
        </defs>
        <rect x={0} y={0} width={s.width} height={s.floorY} fill={`url(#${uid}-wall)`} />
        <rect x={0} y={s.floorY} width={s.width} height={s.height - s.floorY} fill="#ebe7dc" />
        <line x1={0} y1={s.floorY} x2={s.width} y2={s.floorY} stroke={INK} strokeOpacity={0.35} strokeWidth={stroke} />

        {/* Stand behind the print: the roll-up pole, the X-banner frame. */}
        {s.poles.map((l, i) => (
          <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#8a8f99" strokeWidth={poleW} strokeLinecap="round" />
        ))}

        {/* Canvas: the frame's side, a little darker. */}
        {s.depthCm > 0 ? (
          <path
            d={`M${p.x + p.w} ${p.y}l${s.depthCm} ${s.depthCm * 0.6}v${p.h - s.depthCm * 0.6}h${-s.depthCm}z`}
            fill={INK}
            fillOpacity={0.35}
          />
        ) : null}

        <rect x={p.x} y={p.y} width={p.w} height={p.h} fill="#e8ebf1" />
        {imageUrl ? (
          <image href={imageUrl} x={p.x} y={p.y} width={p.w} height={p.h} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${uid}-clip)`} />
        ) : null}
        <rect x={p.x} y={p.y} width={p.w} height={p.h} fill="none" stroke={INK} strokeOpacity={0.55} strokeWidth={stroke} />
        {/* Wall pieces cast a soft shadow; free-standing ones a floor shadow. */}
        {s.cassette ? (
          // Roll-up: the clamp rail on top of the banner.
          <rect x={p.x - 0.5} y={p.y - 1.5} width={p.w + 1} height={3} rx={1} fill="#9aa1ad" />
        ) : null}
        {s.cassette ? (
          <rect x={s.cassette.x} y={s.cassette.y} width={s.cassette.w} height={s.cassette.h} rx={s.cassette.h * 0.35} fill="#9aa1ad" stroke={INK} strokeOpacity={0.4} strokeWidth={stroke} />
        ) : null}
        {s.cassette || s.poles.length ? (
          <ellipse cx={p.x + p.w / 2} cy={s.floorY} rx={p.w * 0.55} ry={Math.max(1.5, s.fontCm * 0.15)} fill={INK} fillOpacity={0.12} />
        ) : null}

        {/* The person. */}
        <g transform={`translate(${s.person.x} ${s.person.y})`} fill={INK} fillOpacity={0.78}>
          <circle cx={23} cy={11} r={11} />
          <path d={PERSON_PATH} />
        </g>
        <ellipse cx={s.person.x + 23} cy={s.floorY} rx={26} ry={Math.max(1.5, s.fontCm * 0.15)} fill={INK} fillOpacity={0.12} />

        {/* Size labels: gold dimension lines, navy text. */}
        <g stroke={GOLD} strokeWidth={stroke * 1.4}>
          <line x1={p.x} y1={s.widthLabel.y - s.fontCm * 1.05} x2={p.x + p.w} y2={s.widthLabel.y - s.fontCm * 1.05} />
          <line x1={p.x} y1={s.widthLabel.y - s.fontCm * 1.4} x2={p.x} y2={s.widthLabel.y - s.fontCm * 0.7} />
          <line x1={p.x + p.w} y1={s.widthLabel.y - s.fontCm * 1.4} x2={p.x + p.w} y2={s.widthLabel.y - s.fontCm * 0.7} />
          <line x1={s.heightLabel.x - s.fontCm * 0.4} y1={p.y} x2={s.heightLabel.x - s.fontCm * 0.4} y2={p.y + p.h} />
          <line x1={s.heightLabel.x - s.fontCm * 0.75} y1={p.y} x2={s.heightLabel.x - s.fontCm * 0.05} y2={p.y} />
          <line x1={s.heightLabel.x - s.fontCm * 0.75} y1={p.y + p.h} x2={s.heightLabel.x - s.fontCm * 0.05} y2={p.y + p.h} />
        </g>
        <g fill={INK} fontSize={s.fontCm} fontWeight={700} fontFamily="inherit">
          <text x={s.widthLabel.x} y={s.widthLabel.y} textAnchor="middle" dominantBaseline="middle">
            {sizeText.width}
          </text>
          <text x={s.heightLabel.x} y={s.heightLabel.y} dominantBaseline="middle">
            {sizeText.height}
          </text>
        </g>
      </svg>
      <figcaption className="text-sm text-(--muted2)">{caption}</figcaption>
    </figure>
  );
}

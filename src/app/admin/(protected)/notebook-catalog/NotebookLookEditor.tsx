"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";
import {
  NOTEBOOK_ACCENTS,
  NOTEBOOK_ACCENT_TEXTURES,
  NOTEBOOK_BINDINGS,
  NOTEBOOK_FINISHES,
  NOTEBOOK_LOOK_LIMITS,
  NOTEBOOK_LOOK_PRESETS,
  parseNotebookLook,
  type NotebookLook,
  type NotebookLookPresetKey,
} from "@/lib/notebook/notebookLook";

/**
 * «Форма блокнота» in the admin notebook card: size, binding, cover, strap,
 * ribbon, pen and the second cover material. Remount it (new `key`) after a
 * preset or autofill so the number inputs pick up the new values.
 */
export function NotebookLookEditor({
  look,
  onChange,
  disabled,
}: {
  look: NotebookLook;
  onChange: (next: NotebookLook) => void;
  disabled: boolean;
}) {
  const { t } = useLanguageStore();
  const s = t.admin.notebookLook;
  const [widthStr, setWidthStr] = useState(String(look.widthCm));
  const [heightStr, setHeightStr] = useState(String(look.heightCm));
  const [thickStr, setThickStr] = useState(String(look.thicknessCm));
  const [shareStr, setShareStr] = useState(String(look.accentSharePct));

  const set = (patch: Partial<NotebookLook>) => onChange(parseNotebookLook({ ...look, ...patch }));
  const num = (v: string) => Number.parseFloat(v.trim().replace(",", "."));

  const presetLabel: Record<NotebookLookPresetKey, string> = {
    a5Hard: s.presetA5Hard,
    a6Hard: s.presetA6Hard,
    a5Spiral: s.presetA5Spiral,
    spiralPen: s.presetSpiralPen,
  };
  const presetMatches = (p: Partial<NotebookLook>) =>
    (Object.keys(p) as (keyof NotebookLook)[]).every((k) => look[k] === p[k]);

  const pill = (active: boolean) =>
    cn(
      "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
      active ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
      disabled && "cursor-not-allowed opacity-60",
    );

  const choice = <T extends string>(label: string, list: readonly T[], value: T, labels: Record<T, string>, pick: (v: T) => void) => (
    <div>
      <p className="text-[11px] font-medium text-gray-600">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {list.map((v) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} disabled={disabled} onClick={() => pick(v)} className={pill(value === v)}>
            {labels[v]}
          </button>
        ))}
      </div>
    </div>
  );

  const toggle = (label: string, checked: boolean, pick: (v: boolean) => void) => (
    <label className="inline-flex items-center gap-2 text-xs text-gray-700">
      <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={checked} disabled={disabled} onChange={(e) => pick(e.target.checked)} />
      {label}
    </label>
  );

  const colour = (label: string, value: string, pick: (v: string) => void) => (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-medium text-gray-600">{label}</label>
      <div className="flex items-center gap-2">
        <Input
          type="color"
          value={value}
          onChange={(e) => pick(e.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-gray-200 p-1"
          disabled={disabled}
          aria-label={label}
        />
        <span className="font-mono text-[11px] text-gray-500 tabular-nums">{value}</span>
      </div>
    </div>
  );

  const L = NOTEBOOK_LOOK_LIMITS;
  const sizeInput = (label: string, value: string, setStr: (v: string) => void, key: "widthCm" | "heightCm" | "thicknessCm", min: number, max: number) => (
    <div>
      <label className="text-[11px] font-medium text-gray-600">{label}</label>
      <Input
        type="number"
        step="0.1"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          setStr(e.target.value);
          const n = num(e.target.value);
          if (Number.isFinite(n) && n >= min && n <= max) set({ [key]: n });
        }}
        className="mt-1 tabular-nums"
        disabled={disabled}
        inputMode="decimal"
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-gray-800">{s.section}</p>
        <p className="mt-0.5 text-[11px] text-gray-500">{s.hint}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {NOTEBOOK_LOOK_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              disabled={disabled}
              onClick={() => {
                const next = parseNotebookLook({ ...look, ...p.look });
                setWidthStr(String(next.widthCm));
                setHeightStr(String(next.heightCm));
                setThickStr(String(next.thicknessCm));
                onChange(next);
              }}
              className={pill(presetMatches(p.look))}
            >
              {presetLabel[p.key]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {sizeInput(s.width, widthStr, setWidthStr, "widthCm", L.minCm, L.maxCm)}
        {sizeInput(s.height, heightStr, setHeightStr, "heightCm", L.minCm, L.maxCm)}
        {sizeInput(s.thickness, thickStr, setThickStr, "thicknessCm", L.minThicknessCm, L.maxThicknessCm)}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {choice(s.binding, NOTEBOOK_BINDINGS, look.binding, { hardcover: s.bindingHardcover, spiral: s.bindingSpiral }, (v) => set({ binding: v }))}
        {choice(s.finish, NOTEBOOK_FINISHES, look.finish, { leather: s.finishLeather, matte: s.finishMatte }, (v) => set({ finish: v }))}
      </div>

      <div>
        <p className="text-[11px] font-medium text-gray-600">{s.details}</p>
        <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-2">
          {toggle(s.strap, look.hasStrap, (v) => set({ hasStrap: v }))}
          {toggle(s.bookmark, look.hasBookmark, (v) => set({ hasBookmark: v }))}
          {toggle(s.pen, look.hasPen, (v) => set({ hasPen: v }))}
        </div>
        {(look.binding === "spiral" || look.hasPen) && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            {look.binding === "spiral" && colour(s.wireColor, look.wireColorHex, (v) => set({ wireColorHex: v }))}
            {look.hasPen && colour(s.penColor, look.penColorHex, (v) => set({ penColorHex: v }))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {choice(
          s.accent,
          NOTEBOOK_ACCENTS,
          look.accent,
          { none: s.accentNone, bottom: s.accentBottom, spine: s.accentSpine },
          (v) => set({ accent: v }),
        )}
        {look.accent !== "none" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
            {colour(s.accentColor, look.accentColorHex, (v) => set({ accentColorHex: v }))}
            <div>
              <label className="text-[11px] font-medium text-gray-600">{s.accentShare}</label>
              <Input
                type="number"
                step="1"
                min={L.minAccentPct}
                max={L.maxAccentPct}
                value={shareStr}
                onChange={(e) => {
                  setShareStr(e.target.value);
                  const n = num(e.target.value);
                  if (Number.isFinite(n) && n >= L.minAccentPct && n <= L.maxAccentPct) set({ accentSharePct: n });
                }}
                className="mt-1 tabular-nums"
                disabled={disabled}
                inputMode="numeric"
              />
            </div>
            {choice("", NOTEBOOK_ACCENT_TEXTURES, look.accentTexture, { plain: s.texturePlain, cork: s.textureCork }, (v) => set({ accentTexture: v }))}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Copy,
  FlipHorizontal,
  Trash2,
} from "lucide-react";
import { FONT_OPTIONS, TEXT_COLOR_OPTIONS } from "@/lib/editor/editorPalette";
import { useDesignEditor } from "@/lib/design/editorStore";
import type { DesignElement, ImageMask, TextAlign } from "@/lib/design/doc";
import { Input } from "@/components/ui/input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";

const ACTIVE_CHIP =
  "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-50 hover:text-amber-800";

export default function DesignInspector() {
  const { t } = useLanguageStore();
  const ds = t.admin.designStudio;
  const selectedId = useDesignEditor((s) => s.selectedId);
  const elements = useDesignEditor((s) => s.doc.elements);
  const updateElement = useDesignEditor((s) => s.updateElement);
  const removeElement = useDesignEditor((s) => s.removeElement);
  const duplicateElement = useDesignEditor((s) => s.duplicateElement);
  const reorderElement = useDesignEditor((s) => s.reorderElement);

  const element = elements.find((el) => el.id === selectedId) ?? null;

  if (!element) {
    return (
      <aside className="w-72 shrink-0 border-l border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-500">{ds.inspectorEmpty}</p>
      </aside>
    );
  }

  const kindLabel =
    element.kind === "text" ? ds.kindText : element.kind === "image" ? ds.kindImage : ds.kindShape;

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col overflow-y-auto border-l border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <span className="text-sm font-semibold text-gray-800">{kindLabel}</span>
        <div className="flex gap-1">
          <IconButton title={ds.bringForward} onClick={() => reorderElement(element.id, "forward")}>
            <ArrowUp className="h-4 w-4" aria-hidden />
          </IconButton>
          <IconButton title={ds.sendBackward} onClick={() => reorderElement(element.id, "backward")}>
            <ArrowDown className="h-4 w-4" aria-hidden />
          </IconButton>
          <IconButton title={ds.duplicate} onClick={() => duplicateElement(element.id)}>
            <Copy className="h-4 w-4" aria-hidden />
          </IconButton>
          <IconButton title={ds.delete} danger onClick={() => removeElement(element.id)}>
            <Trash2 className="h-4 w-4" aria-hidden />
          </IconButton>
        </div>
      </div>

      <div className="space-y-4 p-3">
        {element.kind === "text" && (
          <TextControls element={element} onChange={(patch) => updateElement(element.id, patch)} />
        )}
        {element.kind === "image" && (
          <ImageControls element={element} onChange={(patch) => updateElement(element.id, patch)} />
        )}
        {element.kind === "shape" && (
          <ShapeControls element={element} onChange={(patch) => updateElement(element.id, patch)} />
        )}

        <Section title={ds.position}>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label={ds.posX}
              value={element.x}
              onChange={(x) => updateElement(element.id, { x })}
            />
            <NumberField
              label={ds.posY}
              value={element.y}
              onChange={(y) => updateElement(element.id, { y })}
            />
            <NumberField
              label={ds.width}
              value={element.width}
              min={8}
              onChange={(width) => updateElement(element.id, { width })}
            />
            <NumberField
              label={ds.height}
              value={element.height}
              min={8}
              onChange={(height) => updateElement(element.id, { height })}
            />
          </div>
          <RangeField
            label={ds.rotation(Math.round(element.rotation))}
            value={element.rotation}
            min={-180}
            max={180}
            step={1}
            onChange={(rotation) => updateElement(element.id, { rotation })}
          />
          <RangeField
            label={ds.opacity(Math.round(element.opacity * 100))}
            value={element.opacity}
            min={0}
            max={1}
            step={0.05}
            onChange={(opacity) => updateElement(element.id, { opacity })}
          />
        </Section>
      </div>
    </aside>
  );
}

function TextControls({
  element,
  onChange,
}: {
  element: Extract<DesignElement, { kind: "text" }>;
  onChange: (patch: Partial<Extract<DesignElement, { kind: "text" }>>) => void;
}) {
  const { t } = useLanguageStore();
  const ds = t.admin.designStudio;
  return (
    <>
      <Section title={ds.content}>
        <textarea
          value={element.text}
          onChange={(e) => onChange({ text: e.target.value })}
          rows={3}
          className="w-full resize-y rounded-md border border-gray-200 px-3 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950"
        />
      </Section>

      <Section title={ds.font}>
        <MenuSelect
          value={element.fontId}
          onChange={(fontId) => onChange({ fontId })}
          options={FONT_OPTIONS.map((font) => ({
            value: font.id,
            label: font.latinOnly ? `${font.label} — ${ds.latinOnly}` : font.label,
          }))}
          searchable
          searchPlaceholder={ds.search}
        />

        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label={ds.size}
            value={element.fontSizePx}
            min={8}
            onChange={(fontSizePx) => onChange({ fontSizePx })}
          />
          <NumberField
            label={ds.tracking}
            value={element.letterSpacingPx}
            onChange={(letterSpacingPx) => onChange({ letterSpacingPx })}
          />
        </div>

        <RangeField
          label={ds.lineHeight(element.lineHeight.toFixed(2))}
          value={element.lineHeight}
          min={0.8}
          max={2.5}
          step={0.05}
          onChange={(lineHeight) => onChange({ lineHeight })}
        />

        <div className="flex gap-1">
          {(["left", "center", "right"] as TextAlign[]).map((align) => (
            <IconButton
              key={align}
              title={align}
              active={element.align === align}
              onClick={() => onChange({ align })}
            >
              {align === "left" && <AlignLeft className="h-4 w-4" aria-hidden />}
              {align === "center" && <AlignCenter className="h-4 w-4" aria-hidden />}
              {align === "right" && <AlignRight className="h-4 w-4" aria-hidden />}
            </IconButton>
          ))}
          <ToggleChip
            active={element.fontWeight === 700}
            onClick={() => onChange({ fontWeight: element.fontWeight === 700 ? 400 : 700 })}
          >
            <span className="font-bold">Ж</span>
          </ToggleChip>
          <ToggleChip
            active={!!element.italic}
            onClick={() => onChange({ italic: !element.italic })}
          >
            <span className="italic">К</span>
          </ToggleChip>
          <ToggleChip
            active={!!element.uppercase}
            onClick={() => onChange({ uppercase: !element.uppercase })}
          >
            AA
          </ToggleChip>
        </div>
      </Section>

      <Section title={ds.color}>
        <ColorPicker value={element.color} onChange={(color) => onChange({ color })} />
      </Section>
    </>
  );
}

function ImageControls({
  element,
  onChange,
}: {
  element: Extract<DesignElement, { kind: "image" }>;
  onChange: (patch: Partial<Extract<DesignElement, { kind: "image" }>>) => void;
}) {
  const { t } = useLanguageStore();
  const ds = t.admin.designStudio;
  return (
    <>
      <Section title={ds.crop}>
        <div className="flex gap-1">
          <ToggleChip active={element.fit === "contain"} onClick={() => onChange({ fit: "contain" })}>
            {ds.fitContain}
          </ToggleChip>
          <ToggleChip active={element.fit === "cover"} onClick={() => onChange({ fit: "cover" })}>
            {ds.fitCover}
          </ToggleChip>
          <IconButton
            title={ds.flip}
            active={!!element.flipH}
            onClick={() => onChange({ flipH: !element.flipH })}
          >
            <FlipHorizontal className="h-4 w-4" aria-hidden />
          </IconButton>
        </div>
      </Section>

      <Section title={ds.mask}>
        <MenuSelect
          value={element.mask}
          onChange={(mask) => onChange({ mask: mask as ImageMask })}
          options={[
            { value: "none", label: ds.maskNone },
            { value: "rounded", label: ds.maskRounded },
            { value: "circle", label: ds.maskCircle },
            { value: "heart", label: ds.maskHeart },
          ]}
        />
      </Section>

      <Section title={ds.border}>
        <NumberField
          label={ds.thickness}
          value={element.borderWidthPx}
          min={0}
          onChange={(borderWidthPx) => onChange({ borderWidthPx })}
        />
        {element.borderWidthPx > 0 && (
          <ColorPicker
            value={element.borderColor}
            onChange={(borderColor) => onChange({ borderColor })}
          />
        )}
      </Section>
    </>
  );
}

function ShapeControls({
  element,
  onChange,
}: {
  element: Extract<DesignElement, { kind: "shape" }>;
  onChange: (patch: Partial<Extract<DesignElement, { kind: "shape" }>>) => void;
}) {
  const { t } = useLanguageStore();
  const ds = t.admin.designStudio;
  return (
    <>
      {element.shape !== "line" && (
        <Section title={ds.fill}>
          <ToggleChip
            active={element.fillColor !== null}
            onClick={() => onChange({ fillColor: element.fillColor === null ? "#ffffff" : null })}
          >
            {element.fillColor === null ? ds.noFill : ds.withFill}
          </ToggleChip>
          {element.fillColor !== null && (
            <ColorPicker
              value={element.fillColor}
              onChange={(fillColor) => onChange({ fillColor })}
            />
          )}
        </Section>
      )}

      <Section title={element.shape === "line" ? ds.line : ds.stroke}>
        <NumberField
          label={ds.thickness}
          value={element.strokeWidthPx}
          min={0}
          onChange={(strokeWidthPx) => onChange({ strokeWidthPx })}
        />
        <ColorPicker
          value={element.strokeColor}
          onChange={(strokeColor) => onChange({ strokeColor })}
        />
      </Section>

      {element.shape === "rect" && (
        <Section title={ds.cornerRadius}>
          <NumberField
            label={ds.radius}
            value={element.cornerRadiusPx}
            min={0}
            onChange={(cornerRadiusPx) => onChange({ cornerRadiusPx })}
          />
        </Section>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
        {title}
      </h3>
      {children}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-[11px] text-gray-600">
      {label}
      <Input
        type="number"
        value={Math.round(value)}
        min={min}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(min !== undefined ? Math.max(min, next) : next);
        }}
        className="mt-0.5 h-8 px-2 text-sm"
      />
    </label>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-[11px] text-gray-600">
      {label}
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-amber-600"
      />
    </label>
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {TEXT_COLOR_OPTIONS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            title={color}
            className={cn(
              "h-6 w-6 rounded border-2",
              value.toLowerCase() === color.toLowerCase() ? "border-amber-400" : "border-gray-200",
            )}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full cursor-pointer rounded-md border border-gray-200"
      />
    </div>
  );
}

function IconButton({
  children,
  title,
  onClick,
  active,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "rounded-md border border-gray-200 p-1.5",
        danger
          ? "text-red-600 hover:bg-red-50"
          : active
            ? ACTIVE_CHIP
            : "text-gray-600 hover:bg-gray-100",
      )}
    >
      {children}
    </button>
  );
}

function ToggleChip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1.5 text-xs font-medium",
        active ? ACTIVE_CHIP : "border-gray-200 text-gray-600 hover:bg-gray-100",
      )}
    >
      {children}
    </button>
  );
}

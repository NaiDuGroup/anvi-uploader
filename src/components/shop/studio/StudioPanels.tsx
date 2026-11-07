"use client";

import { useEffect, useRef, useState } from "react";
import { BG_COLOR_OPTIONS, FONT_OPTIONS, TEXT_COLOR_OPTIONS, filterPaletteByBase } from "@/lib/editor/editorPalette";
import {
  duplicateLayer,
  imageEffectiveDpi,
  mapSurface,
  removeLayer,
  reorderLayer,
  updateLayer,
  type StudioDoc,
  type StudioImageLayer,
  type StudioLayer,
  type StudioQrLayer,
  type StudioQrType,
  type StudioShapeLayer,
  type StudioSurface,
  type StudioTextLayer,
} from "@/lib/studio/document";
import type { ShopLang } from "@/lib/storefront/i18n";
import { fitTextBox } from "@/lib/studio/fonts";
import { studioPhotoT } from "@/lib/studio/i18n.photo";
import { frameAfterTurn, orientedSize } from "@/lib/studio/photoEdit";
import type { StudioEditorKey } from "@/lib/studio/i18n.editor";
import type { StudioT } from "@/lib/studio/i18n";
import { newImageLayer, newQrLayer, newShapeLayer, newTextLayer, type TextPreset } from "@/lib/studio/layerFactory";
import { layerQrMatrix, qrPayload, qrPrefill } from "@/lib/studio/qr";
import type { StudioRenderAssets } from "@/lib/studio/render";
import type { StudioFields } from "@/lib/studio/smartFields";
import type { StudioSurfaceSpec } from "@/lib/studio/surfaces";
import {
  Field,
  FieldLabel,
  Icon,
  PanelTitle,
  STUDIO_ICONS,
  Segmented,
  Slider,
  StudioButton,
  Swatches,
  Toggle,
  inputCls,
} from "./StudioUi";
import { StudioPhotoTools } from "./StudioPhotoTools";

/** What every Studio panel gets from the editor. */
export interface StudioPanelCtx {
  t: StudioT<StudioEditorKey>;
  doc: StudioDoc;
  spec: StudioSurfaceSpec;
  surface: StudioSurface;
  selected: StudioLayer | null;
  /** Commit an edit (`tag` coalesces a gesture / typing into one undo step). */
  commit: (doc: StudioDoc, tag?: string) => void;
  /** Add a layer on top and select it (`autoInk`: a new text takes white / navy for what is under it). */
  addLayer: (layer: StudioLayer, opts?: { autoInk?: boolean }) => void;
  select: (id: string | null) => void;
  /** Open the photo picker; the photo fills `targetId` (an image layer) or becomes a new layer. */
  requestPhoto: (targetId: string | null) => void;
  productColor: string | null;
  cropMode: boolean;
  setCropMode: (v: boolean) => void;
  /** Bumped when a text should get focus (double click on the canvas). */
  editTextNonce: number;
  photoMissing: (localId: string) => boolean;
  /** Text colours offered first (C: brand colours from «Datele mele»). */
  extraColors?: readonly string[];
  /** Typing / a font change: the text box adjusted to its zone (apparel: shrink, then wrap, never past the zone). */
  fitText?: (layer: StudioTextLayer) => StudioTextLayer;
  /** «Datele mele»: prefill of the QR phone / contact forms. */
  fields?: StudioFields;
  /** Shop language (photo tools strings). */
  lang: ShopLang;
  /** Editor photo copies (filter thumbnails, auto-enhance). */
  renderAssets: StudioRenderAssets;
}

const fmtCm = (mm: number) => (Math.round(mm) / 10).toLocaleString("ro-RO", { maximumFractionDigits: 1 });

// ─── Tool panels ──────────────────────────────────────────────────────────

export function TextToolPanel({ ctx }: { ctx: StudioPanelCtx }) {
  const { t, surface, addLayer } = ctx;
  const add = (preset: TextPreset) => {
    const sample = preset === "title" ? t("sampleTitle") : preset === "subtitle" ? t("sampleSubtitle") : preset === "arc" ? t("sampleArc") : t("sampleBody");
    addLayer(fitTextBox(newTextLayer(surface, preset, sample)), { autoInk: true });
  };
  return (
    <div className="flex flex-col gap-2.5">
      <PanelTitle>{t("textTitle")}</PanelTitle>
      <StudioButton variant="dark" onClick={() => add("body")}>
        {t("addText")}
      </StudioButton>
      <button type="button" onClick={() => add("title")} className="min-h-12 rounded-[10px] border-[1.5px] border-(--line) bg-white px-3 py-2 text-left font-[family-name:var(--font-mug-playfair),serif] text-[22px] font-bold">
        {t("presetTitle")}
      </button>
      <button type="button" onClick={() => add("subtitle")} className="min-h-12 rounded-[10px] border-[1.5px] border-(--line) bg-white px-3 py-2 text-left text-base font-bold">
        {t("presetSubtitle")}
      </button>
      <button type="button" onClick={() => add("body")} className="min-h-12 rounded-[10px] border-[1.5px] border-(--line) bg-white px-3 py-2 text-left text-[13px]">
        {t("presetBody")}
      </button>
      <button
        type="button"
        onClick={() => add("arc")}
        className="flex min-h-12 items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-dashed border-(--line2) bg-white px-3 text-[13px] font-bold"
      >
        <svg width="40" height="18" viewBox="0 0 40 18" aria-hidden="true">
          <path d="M3 15 Q20 -2 37 15" fill="none" stroke="#14213d" strokeWidth="2" />
        </svg>
        {t("presetArc")}
      </button>
    </div>
  );
}

export function ImagesToolPanel({ ctx }: { ctx: StudioPanelCtx }) {
  const { t, surface, addLayer, requestPhoto } = ctx;
  return (
    <div className="flex flex-col gap-2.5">
      <PanelTitle>{t("imagesTitle")}</PanelTitle>
      <StudioButton variant="dark" onClick={() => requestPhoto(null)}>
        <Icon d={STUDIO_ICONS.images} />
        {t("uploadPhoto")}
      </StudioButton>
      <p className="m-0 text-xs text-(--muted2)">{t("uploadHint")}</p>
      <FieldLabel>{t("addPlaceholder")}</FieldLabel>
      <div className="grid grid-cols-4 gap-2">
        {(["rect", "rounded", "circle", "heart"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-label={t(m === "rect" ? "maskRect" : m === "rounded" ? "maskRounded" : m === "circle" ? "maskCircle" : "maskHeart")}
            onClick={() => addLayer(newImageLayer(surface, null, m))}
            className="flex aspect-square min-h-12 items-center justify-center rounded-[10px] border-[1.5px] border-(--line) bg-(--soft)"
          >
            <MaskGlyph mask={m} />
          </button>
        ))}
      </div>
    </div>
  );
}

function MaskGlyph({ mask }: { mask: StudioImageLayer["mask"] }) {
  return (
    <svg width="26" height="26" viewBox="0 0 100 100" aria-hidden="true" fill="#9aa6ba">
      {mask === "rect" ? <rect x="10" y="18" width="80" height="64" /> : null}
      {mask === "rounded" ? <rect x="10" y="18" width="80" height="64" rx="16" /> : null}
      {mask === "circle" ? <circle cx="50" cy="50" r="40" /> : null}
      {mask === "heart" ? <path d="M50 92C50 72 6 62 6 32 6 10 34 4 50 28 66 4 94 10 94 32 94 62 50 72 50 92z" /> : null}
    </svg>
  );
}

const SHAPES = ["rect", "rounded", "ellipse", "line", "triangle", "star", "heart", "snowflake", "balloon", "tree"] as const satisfies readonly StudioShapeLayer["shape"][];
type PanelShape = (typeof SHAPES)[number];
const SHAPE_KEY: Record<PanelShape, StudioEditorKey> = {
  rect: "shapeRect",
  rounded: "shapeRounded",
  ellipse: "shapeEllipse",
  line: "shapeLine",
  triangle: "shapeTriangle",
  star: "shapeStar",
  heart: "shapeHeart",
  snowflake: "shapeSnowflake",
  balloon: "shapeBalloon",
  tree: "shapeTree",
};
const SHAPE_ICON: Record<PanelShape, string> = {
  rect: "M3 6h18v12H3z",
  rounded: "M7 6h10a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-4a4 4 0 0 1 4-4z",
  ellipse: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  line: "M3 12h18",
  triangle: "M12 4l9 16H3z",
  star: STUDIO_ICONS.elements,
  heart: "M12 21C12 16 3 13 3 8a4.5 4.5 0 0 1 9-1 4.5 4.5 0 0 1 9 1c0 5-9 8-9 13z",
  snowflake: "M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 2 3-2M9 20l3-2 3 2",
  balloon: "M12 2a6 7 0 1 0 0 14 6 7 0 1 0 0-14zM12 16l-1 2h2zM12 18v4",
  tree: "M12 2l5 6h-2l4 6h-3l4 5H4l4-5H5l4-6H7zM11 19h2v3h-2z",
};

export function ElementsToolPanel({ ctx }: { ctx: StudioPanelCtx }) {
  const { t, surface, addLayer } = ctx;
  return (
    <div className="flex flex-col gap-2.5">
      <PanelTitle>{t("elementsTitle")}</PanelTitle>
      <FieldLabel>{t("shapes")}</FieldLabel>
      <div className="grid grid-cols-5 gap-2">
        {SHAPES.map((s) => (
          <button
            key={s}
            type="button"
            title={t(SHAPE_KEY[s])}
            aria-label={t(SHAPE_KEY[s])}
            onClick={() => addLayer(newShapeLayer(surface, s, s === "tree" ? "#1f6b3a" : s === "heart" || s === "balloon" ? "#c0392b" : s === "snowflake" ? "#2f6fed" : "#c9a227"))}
            className="flex aspect-square min-h-12 items-center justify-center rounded-[10px] border-[1.5px] border-(--line) bg-white"
          >
            <Icon d={SHAPE_ICON[s]} size={24} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function BackgroundToolPanel({ ctx }: { ctx: StudioPanelCtx }) {
  const { t, doc, surface, commit, productColor } = ctx;
  const colors = filterPaletteByBase(BG_COLOR_OPTIONS.filter((c) => c !== "transparent"), productColor);
  return (
    <div className="flex flex-col gap-3">
      <PanelTitle>{t("backgroundTitle")}</PanelTitle>
      <Swatches
        colors={[...colors, "#14213d", "#faf3dc", "#f6eee3", "#c0392b", "#1f6b3a"]}
        value={surface.background}
        onChange={(c) => commit(mapSurface(doc, surface.id, (s) => ({ ...s, background: c })), "bg")}
        otherLabel={t("otherColor")}
        allowNone
        noneLabel={t("backgroundNone")}
      />
      <p className="m-0 text-xs text-(--muted2)">{surface.background ? "" : t("backgroundNone")}</p>
      <p className="m-0 text-xs text-(--muted2)">{t("backgroundHint")}</p>
    </div>
  );
}

// ─── QR ───────────────────────────────────────────────────────────────────

type QrValue = StudioQrLayer["qr"];

function QrForm({ t, value, onChange, fields }: { t: StudioPanelCtx["t"]; value: QrValue; onChange: (v: QrValue) => void; fields?: StudioFields }) {
  const set = (k: string, v: string) => onChange({ ...value, data: { ...value.data, [k]: v } });
  const input = (k: string, label: StudioEditorKey, type = "text", inputMode?: "url" | "tel" | "email") => (
    <Field label={t(label)}>
      <input className={inputCls} type={type} inputMode={inputMode} value={value.data[k] ?? ""} maxLength={300} onChange={(e) => set(k, e.target.value)} />
    </Field>
  );
  return (
    <div className="flex flex-col gap-2.5">
      <Segmented<StudioQrType>
        label={t("qrTitle")}
        value={value.type}
        onChange={(type) => onChange({ type, data: qrPrefill(type, value.data, fields) })}
        options={[
          { value: "url", label: t("qrUrl") },
          { value: "tel", label: t("qrTel") },
          { value: "wifi", label: t("qrWifi") },
          { value: "vcard", label: t("qrVcard") },
        ]}
      />
      {value.type === "url" ? input("url", "qrUrlLabel", "url", "url") : null}
      {value.type === "tel" ? input("phone", "qrPhoneLabel", "tel", "tel") : null}
      {value.type === "wifi" ? (
        <>
          {input("ssid", "qrSsid")}
          <Field label={t("qrSecurity")}>
            <select className={inputCls} value={value.data.security ?? "WPA"} onChange={(e) => set("security", e.target.value)}>
              <option value="WPA">WPA / WPA2</option>
              <option value="WEP">WEP</option>
              <option value="nopass">{t("qrNoPass")}</option>
            </select>
          </Field>
          {value.data.security === "nopass" ? null : input("password", "qrPassword")}
        </>
      ) : null}
      {value.type === "vcard" ? (
        <>
          {input("name", "qrName")}
          {input("title", "qrJob")}
          {input("company", "qrCompany")}
          {input("phone", "qrPhoneLabel", "tel", "tel")}
          {input("email", "qrEmail", "email", "email")}
          {input("site", "qrSite", "url", "url")}
        </>
      ) : null}
    </div>
  );
}

function QrPreview({ qr, color, background }: { qr: QrValue; color: string; background: string | null }) {
  const m = layerQrMatrix({ qr });
  if (!m) return null;
  const n = m.size + 4;
  const cells: string[] = [];
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.dark[r * m.size + c]) cells.push(`M${c + 2} ${r + 2}h1v1h-1z`);
  return (
    <svg viewBox={`0 0 ${n} ${n}`} width={120} height={120} shapeRendering="crispEdges" className="self-center rounded border border-(--line)" role="img" aria-label="QR">
      <rect width={n} height={n} fill={background ?? "#ffffff"} />
      <path d={cells.join("")} fill={color} />
    </svg>
  );
}

export function QrToolPanel({ ctx }: { ctx: StudioPanelCtx }) {
  const { t, surface, addLayer, selected, doc, commit } = ctx;
  const editing: StudioQrLayer | null = selected?.kind === "qr" ? selected : null;
  const [draft, setDraft] = useState<QrValue>(() => ({ type: "url", data: qrPrefill("url", {}, ctx.fields) }));
  const [color, setColor] = useState("#000000");
  const [bg, setBg] = useState<string | null>("#ffffff");
  const value: QrValue = editing ? editing.qr : draft;
  const payload: string = qrPayload(value.type, value.data);
  return (
    <div className="flex flex-col gap-3">
      <PanelTitle>{t("qrTitle")}</PanelTitle>
      <QrForm
        t={t}
        value={value}
        fields={ctx.fields}
        onChange={(v) => (editing ? commit(updateLayer(doc, editing.id, { qr: v }), `qr:${editing.id}`) : setDraft(v))}
      />
      {payload ? (
        <QrPreview qr={value} color={editing?.color ?? color} background={editing ? editing.background : bg} />
      ) : (
        <p className="m-0 rounded-[10px] bg-(--soft) px-3 py-2 text-sm text-(--muted2)">{t("qrEmpty")}</p>
      )}
      {editing ? null : (
        <>
          <FieldLabel>{t("qrColor")}</FieldLabel>
          <Swatches colors={["#000000", "#14213d", "#7a6512", "#b5532f"]} value={color} onChange={(c) => setColor(c ?? "#000000")} otherLabel={t("otherColor")} />
          <Toggle checked={bg != null} onChange={(v) => setBg(v ? "#ffffff" : null)} label={t("qrBackground")} />
          <StudioButton variant="dark" disabled={!payload} onClick={() => addLayer(newQrLayer(surface, value, color, bg))}>
            {t("qrAdd")}
          </StudioButton>
        </>
      )}
      <p className="m-0 text-xs text-(--muted2)">{t("qrScanHint")}</p>
    </div>
  );
}

// ─── Properties of the selected layer ─────────────────────────────────────

export function layerName(t: StudioPanelCtx["t"], l: StudioLayer): string {
  if (l.name) return l.name;
  if (l.kind === "text") return l.text.split("\n")[0]!.slice(0, 28) || t("layerText");
  return t(l.kind === "image" ? "layerImage" : l.kind === "qr" ? "layerQr" : "layerShape");
}

export function dpiLevel(dpi: number, target: number): "good" | "ok" | "low" {
  return dpi >= target * 0.8 ? "good" : dpi >= target * 0.5 ? "ok" : "low";
}

export function DpiBadge({ ctx, layer }: { ctx: StudioPanelCtx; layer: StudioImageLayer }) {
  const dpi = imageEffectiveDpi(layer);
  if (dpi == null) return null;
  const lvl = dpiLevel(dpi, ctx.spec.dpi);
  const n = Math.round(dpi);
  const cls = lvl === "good" ? "bg-(--ok-soft) text-(--ok)" : lvl === "ok" ? "bg-(--warn-soft) text-(--warn)" : "bg-(--err-soft) text-(--err)";
  return (
    <p role="status" className={`m-0 rounded-[10px] px-3 py-2 text-[13px] font-bold ${cls}`}>
      {ctx.t(lvl === "good" ? "dpiGood" : lvl === "ok" ? "dpiOk" : "dpiLow", { dpi: n })}
    </p>
  );
}

function TextProps({ ctx, l }: { ctx: StudioPanelCtx; l: StudioTextLayer }) {
  const { t, doc, commit, productColor, editTextNonce } = ctx;
  const patch = (p: Partial<StudioTextLayer>, field: string) => {
    let next = fitTextBox({ ...l, ...p });
    if (ctx.fitText && (field === "text" || field === "font" || field === "spacing")) next = ctx.fitText(next);
    commit(updateLayer(doc, l.id, { ...next, placeholder: p.text != null ? false : l.placeholder }), `text:${l.id}:${field}`);
  };
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editTextNonce > 0) {
      ta.current?.focus();
      ta.current?.select();
    }
  }, [editTextNonce]);
  const colors = filterPaletteByBase([...(ctx.extraColors ?? []), "#14213d", "#c9a227", "#b5532f", "#3b2a20", ...TEXT_COLOR_OPTIONS], productColor);
  const shadowMode: "off" | "light" | "strong" = !l.shadow ? "off" : l.shadow.blurMm > 1.2 ? "strong" : "light";
  return (
    <div className="flex flex-col gap-3">
      <Field label={t("textContent")}>
        <textarea
          ref={ta}
          rows={2}
          maxLength={400}
          value={l.text}
          onChange={(e) => patch({ text: e.target.value }, "text")}
          className="min-h-16 w-full rounded-[10px] border-[1.5px] border-(--line2) px-3 py-2 text-[15px] font-semibold outline-none focus:border-(--ink)"
        />
      </Field>
      <Field label={t("font")}>
        <select className={inputCls} value={l.fontFamily} onChange={(e) => patch({ fontFamily: e.target.value }, "font")}>
          {FONT_OPTIONS.map((f) => (
            <option key={f.id} value={f.family}>
              {f.label}
              {f.latinOnly ? ` (${t("latinOnly")})` : ""}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label={t("size")}>
          <input
            className={inputCls}
            type="number"
            inputMode="decimal"
            min={2}
            max={600}
            step={1}
            value={Math.round(l.sizePt * 10) / 10}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v >= 2 && v <= 600) patch({ sizePt: v }, "size");
            }}
          />
        </Field>
        <div className="flex flex-col gap-1.5">
          <FieldLabel>{t("align")}</FieldLabel>
          <Segmented
            label={t("align")}
            value={l.align}
            onChange={(align) => patch({ align }, "align")}
            options={[
              { value: "left", aria: t("alignLeft"), label: <Icon d="M4 6h16M4 12h10M4 18h14" size={16} /> },
              { value: "center", aria: t("alignCenter"), label: <Icon d="M4 6h16M7 12h10M5 18h14" size={16} /> },
              { value: "right", aria: t("alignRight"), label: <Icon d="M4 6h16M10 12h10M6 18h14" size={16} /> },
            ]}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <StudioButton pressed={l.bold} onClick={() => patch({ bold: !l.bold }, "bold")} className="flex-1 font-extrabold">
          {t("bold")}
        </StudioButton>
        <StudioButton pressed={!!l.italic} onClick={() => patch({ italic: !l.italic }, "italic")} className="flex-1 italic">
          {t("italic")}
        </StudioButton>
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel>{t("color")}</FieldLabel>
        <Swatches colors={colors} value={l.color} onChange={(c) => c && patch({ color: c }, "color")} otherLabel={t("otherColor")} />
      </div>
      <div className="flex flex-col gap-2 border-t border-(--line) pt-2">
        <Slider label={t("arc")} value={l.arcDeg ?? 0} min={-180} max={180} step={5} onChange={(v) => patch({ arcDeg: v === 0 ? undefined : v }, "arc")} format={(v) => `${v}°`} />
        {l.text.includes("\n") ? (
          <Slider label={t("lineHeight")} value={l.lineHeight} min={0.8} max={2} step={0.05} onChange={(v) => patch({ lineHeight: v }, "lh")} format={(v) => v.toFixed(2)} />
        ) : null}
        <Slider
          label={t("letterSpacing")}
          value={l.letterSpacingEm ?? 0}
          min={-0.1}
          max={0.5}
          step={0.01}
          onChange={(v) => patch({ letterSpacingEm: v === 0 ? undefined : v }, "ls")}
          format={(v) => v.toFixed(2)}
        />
        <Toggle
          checked={!!l.stroke}
          onChange={(v) => patch({ stroke: v ? { color: l.color === "#ffffff" ? "#14213d" : "#ffffff", widthMm: 0.4 } : undefined }, "stroke")}
          label={t("outline")}
        />
        {l.stroke ? (
          <>
            <Swatches colors={["#ffffff", "#14213d", "#000000", "#c9a227"]} value={l.stroke.color} onChange={(c) => c && patch({ stroke: { ...l.stroke!, color: c } }, "strokec")} otherLabel={t("otherColor")} />
            <Slider label={t("outlineWidth")} value={l.stroke.widthMm} min={0.1} max={2} step={0.05} onChange={(v) => patch({ stroke: { ...l.stroke!, widthMm: v } }, "strokew")} format={(v) => v.toFixed(2)} />
          </>
        ) : null}
        <FieldLabel>{t("shadow")}</FieldLabel>
        <Segmented
          label={t("shadow")}
          value={shadowMode}
          onChange={(m) =>
            patch(
              {
                shadow:
                  m === "off"
                    ? undefined
                    : m === "light"
                      ? { color: "#000000", blurMm: 0.8, dxMm: 0.3, dyMm: 0.4 }
                      : { color: "#000000", blurMm: 2, dxMm: 0.7, dyMm: 0.9 },
              },
              "shadow",
            )
          }
          options={[
            { value: "off", label: t("shadowOff") },
            { value: "light", label: t("shadowLight") },
            { value: "strong", label: t("shadowStrong") },
          ]}
        />
      </div>
    </div>
  );
}

function ImageProps({ ctx, l }: { ctx: StudioPanelCtx; l: StudioImageLayer }) {
  const { t, doc, commit, cropMode, setCropMode, requestPhoto } = ctx;
  const set = (p: Partial<StudioImageLayer>, f: string) => commit(updateLayer(doc, l.id, p), `img:${l.id}:${f}`);
  const missing = l.src?.localId ? ctx.photoMissing(l.src.localId) : false;
  return (
    <div className="flex flex-col gap-3">
      {missing ? <p className="m-0 rounded-[10px] bg-(--warn-soft) px-3 py-2 text-[13px] font-bold text-(--warn)">{t("photoMissing")}</p> : null}
      {l.src ? <DpiBadge ctx={ctx} layer={l} /> : null}
      <StudioButton variant={l.src ? "outline" : "dark"} onClick={() => requestPhoto(l.id)}>
        <Icon d={STUDIO_ICONS.images} />
        {l.src ? t("replacePhoto") : t("fillPlaceholder")}
      </StudioButton>
      <div className="flex flex-col gap-1.5">
        <FieldLabel>{t("mask")}</FieldLabel>
        <div className="grid grid-cols-4 gap-2">
          {(["rect", "rounded", "circle", "heart"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={l.mask === m}
              aria-label={t(m === "rect" ? "maskRect" : m === "rounded" ? "maskRounded" : m === "circle" ? "maskCircle" : "maskHeart")}
              onClick={() => {
                const square = m === "circle" || m === "heart";
                const s = Math.min(l.w, l.h);
                set(square ? { mask: m, x: l.x + (l.w - s) / 2, y: l.y + (l.h - s) / 2, w: s, h: s } : { mask: m }, "mask");
              }}
              className={`flex min-h-11 items-center justify-center rounded-[10px] border-[1.5px] ${l.mask === m ? "border-(--ink) bg-[#e8efff]" : "border-(--line) bg-white"}`}
            >
              <MaskGlyph mask={m} />
            </button>
          ))}
        </div>
      </div>
      {l.src ? (
        <>
          <StudioButton pressed={cropMode} onClick={() => setCropMode(!cropMode)}>
            <Icon d={STUDIO_ICONS.crop} />
            {cropMode ? t("cropDone") : t("cropMode")}
          </StudioButton>
          {cropMode ? <p className="m-0 text-xs text-(--muted2)">{t("cropHint")}</p> : null}
          <Slider label={t("cropZoom")} value={l.crop.zoom} min={1} max={4} step={0.05} onChange={(v) => set({ crop: { ...l.crop, zoom: v } }, "zoom")} format={(v) => `${Math.round(v * 100)}%`} />
          <div className="flex flex-col gap-2 border-t border-(--line) pt-3">
            <FieldLabel>{studioPhotoT(ctx.lang)("adjustTitle")}</FieldLabel>
            <StudioPhotoTools
              lang={ctx.lang}
              layer={l}
              assets={ctx.renderAssets}
              onSrc={(src, tag) => {
                // A free photo shown whole turns with its frame (nothing cut); a slot keeps its frame.
                const box = l.src ? frameAfterTurn(l, orientedSize(l.src), orientedSize(src)) : null;
                commit(updateLayer(doc, l.id, { src, ...(box ?? {}) }), tag);
              }}
              lowRes={(() => {
                const dpi = imageEffectiveDpi(l);
                return dpi != null && dpiLevel(dpi, ctx.spec.dpi) === "low";
              })()}
            />
          </div>
        </>
      ) : null}
      <Toggle checked={!!l.frame} onChange={(v) => set({ frame: v ? { color: "#ffffff", widthMm: 1.5 } : undefined }, "frame")} label={t("frame")} />
      {l.frame ? (
        <>
          <Swatches colors={["#ffffff", "#14213d", "#c9a227", "#000000"]} value={l.frame.color} onChange={(c) => c && set({ frame: { ...l.frame!, color: c } }, "framec")} otherLabel={t("otherColor")} />
          <Slider label={t("frameWidth")} value={l.frame.widthMm} min={0.3} max={8} step={0.1} onChange={(v) => set({ frame: { ...l.frame!, widthMm: v } }, "framew")} format={(v) => v.toFixed(1)} />
        </>
      ) : null}
    </div>
  );
}

function ShapeProps({ ctx, l }: { ctx: StudioPanelCtx; l: StudioShapeLayer }) {
  const { t, doc, commit } = ctx;
  const set = (p: Partial<StudioShapeLayer>, f: string) => commit(updateLayer(doc, l.id, p), `shape:${l.id}:${f}`);
  const palette = [...(ctx.extraColors ?? []), "#14213d", "#c9a227", "#c0392b", "#1f6b3a", "#2f6fed", "#ffffff", "#000000", "#f2bfcf"];
  return (
    <div className="flex flex-col gap-3">
      <FieldLabel>{t("fill")}</FieldLabel>
      <Swatches colors={palette} value={l.fill} onChange={(c) => set({ fill: c }, "fill")} otherLabel={t("otherColor")} allowNone noneLabel={t("noFill")} />
      <Toggle checked={!!l.stroke && (l.strokeMm ?? 0) > 0} onChange={(v) => set(v ? { stroke: "#14213d", strokeMm: 0.6 } : { stroke: null, strokeMm: 0 }, "stroke")} label={t("stroke")} />
      {l.stroke && (l.strokeMm ?? 0) > 0 ? (
        <>
          <Swatches colors={palette} value={l.stroke} onChange={(c) => c && set({ stroke: c }, "strokec")} otherLabel={t("otherColor")} />
          <Slider label={t("strokeWidth")} value={l.strokeMm ?? 0.6} min={0.1} max={6} step={0.1} onChange={(v) => set({ strokeMm: v }, "strokew")} format={(v) => v.toFixed(1)} />
        </>
      ) : null}
    </div>
  );
}

function QrProps({ ctx, l }: { ctx: StudioPanelCtx; l: StudioQrLayer }) {
  const { t, doc, commit } = ctx;
  const set = (p: Partial<StudioQrLayer>, f: string) => commit(updateLayer(doc, l.id, p), `qrp:${l.id}:${f}`);
  return (
    <div className="flex flex-col gap-3">
      <QrForm t={t} value={l.qr} onChange={(qr) => set({ qr }, "data")} />
      {qrPayload(l.qr.type, l.qr.data) ? null : <p className="m-0 rounded-[10px] bg-(--soft) px-3 py-2 text-sm text-(--muted2)">{t("qrEmpty")}</p>}
      <FieldLabel>{t("qrColor")}</FieldLabel>
      <Swatches colors={["#000000", "#14213d", "#7a6512", "#b5532f"]} value={l.color} onChange={(c) => c && set({ color: c }, "color")} otherLabel={t("otherColor")} />
      <Toggle checked={l.background != null} onChange={(v) => set({ background: v ? "#ffffff" : null }, "bg")} label={t("qrBackground")} />
    </div>
  );
}

/** Order / lock / duplicate / delete of a layer (shared by the panel and the phone's context strip). */
export function useLayerActions(ctx: StudioPanelCtx) {
  const { doc, commit, select } = ctx;
  return {
    forward: (id: string) => commit(reorderLayer(doc, id, 1)),
    backward: (id: string) => commit(reorderLayer(doc, id, -1)),
    front: (id: string) => commit(reorderLayer(doc, id, "top")),
    back: (id: string) => commit(reorderLayer(doc, id, "bottom")),
    toggleLock: (l: StudioLayer) => commit(updateLayer(doc, l.id, { locked: !l.locked })),
    toggleHide: (l: StudioLayer) => commit(updateLayer(doc, l.id, { hidden: !l.hidden })),
    duplicate: (id: string) => {
      const next = duplicateLayer(doc, id);
      commit(next);
      const s = next.surfaces.find((sf) => sf.layers.some((x) => x.id === id));
      const i = s?.layers.findIndex((x) => x.id === id) ?? -1;
      const copy = i >= 0 ? s?.layers[i + 1] : undefined;
      if (copy) select(copy.id);
    },
    remove: (id: string) => {
      commit(removeLayer(doc, id));
      select(null);
    },
  };
}

export function PropertiesPanel({ ctx }: { ctx: StudioPanelCtx }) {
  const { t, selected: l, doc, commit } = ctx;
  const a = useLayerActions(ctx);
  if (!l) return <p className="m-0 text-sm text-(--muted2)">{t("nothingSelected")}</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 min-w-0 truncate text-base font-extrabold">{layerName(t, l)}</h2>
        <span className="flex-none text-xs font-bold text-(--muted2)">{t("sizeMm", { w: fmtCm(l.w), h: fmtCm(l.h) })}</span>
      </div>
      {l.kind === "text" ? <TextProps ctx={ctx} l={l} /> : null}
      {l.kind === "image" ? <ImageProps ctx={ctx} l={l} /> : null}
      {l.kind === "shape" ? <ShapeProps ctx={ctx} l={l} /> : null}
      {l.kind === "qr" ? <QrProps ctx={ctx} l={l} /> : null}
      <div className="flex flex-col gap-2 border-t border-(--line) pt-2">
        <Slider label={t("rotation")} value={Math.round(l.rotation)} min={-180} max={180} step={1} onChange={(v) => commit(updateLayer(doc, l.id, { rotation: v }), `rot:${l.id}`)} format={(v) => `${v}°`} />
        <Slider
          label={t("opacity")}
          value={Math.round((l.opacity ?? 1) * 100)}
          min={10}
          max={100}
          step={5}
          onChange={(v) => commit(updateLayer(doc, l.id, { opacity: v >= 100 ? undefined : v / 100 }), `op:${l.id}`)}
          format={(v) => `${v}%`}
        />
        <div className="grid grid-cols-2 gap-2">
          <StudioButton onClick={() => a.forward(l.id)}>{t("bringForward")}</StudioButton>
          <StudioButton onClick={() => a.backward(l.id)}>{t("sendBackward")}</StudioButton>
          <StudioButton onClick={() => a.duplicate(l.id)}>
            <Icon d={STUDIO_ICONS.duplicate} size={16} />
            {t("duplicate")}
          </StudioButton>
          <StudioButton onClick={() => a.toggleLock(l)}>
            <Icon d={l.locked ? STUDIO_ICONS.unlock : STUDIO_ICONS.lock} size={16} />
            {l.locked ? t("unlock") : t("lock")}
          </StudioButton>
        </div>
        <StudioButton variant="danger" onClick={() => a.remove(l.id)}>
          <Icon d={STUDIO_ICONS.trash} size={16} />
          {t("delete")}
        </StudioButton>
      </div>
    </div>
  );
}

export function LayersList({ ctx }: { ctx: StudioPanelCtx }) {
  const { t, surface, selected, select } = ctx;
  const a = useLayerActions(ctx);
  const layers = [...surface.layers].reverse();
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel>{t("layers")}</FieldLabel>
      {layers.length === 0 ? <p className="m-0 text-[13px] text-(--muted2)">{t("noLayers")}</p> : null}
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {layers.map((l, i) => (
          <li
            key={l.id}
            className={`flex min-h-10 items-center gap-1 rounded-lg pl-2 text-[13px] ${selected?.id === l.id ? "bg-[#e8efff] font-extrabold" : "font-semibold"}`}
          >
            <button type="button" onClick={() => select(l.id)} className={`flex min-h-10 min-w-0 flex-1 items-center gap-2 text-left ${l.hidden ? "opacity-50" : ""}`}>
              <span className="min-w-0 flex-1 truncate">{layerName(t, l)}</span>
              <span className="flex-none text-[11px] font-semibold text-(--muted2)">{t(l.kind === "text" ? "layerText" : l.kind === "image" ? "layerImage" : l.kind === "qr" ? "layerQr" : "layerShape")}</span>
            </button>
            <button type="button" aria-label={t("bringForward")} title={t("bringForward")} disabled={i === 0} onClick={() => a.forward(l.id)} className="flex h-9 w-8 items-center justify-center disabled:opacity-30">
              <Icon d={STUDIO_ICONS.up} size={16} />
            </button>
            <button type="button" aria-label={t("sendBackward")} title={t("sendBackward")} disabled={i === layers.length - 1} onClick={() => a.backward(l.id)} className="flex h-9 w-8 items-center justify-center disabled:opacity-30">
              <Icon d={STUDIO_ICONS.down} size={16} />
            </button>
            <button type="button" aria-label={l.hidden ? t("show") : t("hide")} title={l.hidden ? t("show") : t("hide")} onClick={() => a.toggleHide(l)} className="flex h-9 w-8 items-center justify-center">
              <Icon d={l.hidden ? STUDIO_ICONS.eyeOff : STUDIO_ICONS.eye} size={16} />
            </button>
            <button type="button" aria-label={l.locked ? t("unlock") : t("lock")} title={l.locked ? t("unlock") : t("lock")} onClick={() => a.toggleLock(l)} className={`flex h-9 w-8 items-center justify-center ${l.locked ? "text-(--ink)" : "text-(--muted2)"}`}>
              <Icon d={l.locked ? STUDIO_ICONS.lock : STUDIO_ICONS.unlock} size={16} />
            </button>
            <button type="button" aria-label={t("delete")} title={t("delete")} onClick={() => a.remove(l.id)} className="flex h-9 w-8 items-center justify-center text-(--err)">
              <Icon d={STUDIO_ICONS.trash} size={16} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

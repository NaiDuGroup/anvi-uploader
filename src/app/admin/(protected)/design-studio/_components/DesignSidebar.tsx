"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Image as ImageIcon,
  Loader2,
  Palette,
  Search,
  Shapes,
  Sparkles,
  Type,
  Upload,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { FileDropzone } from "@/components/upload/FileDropzone";
import { useDesignEditor } from "@/lib/design/editorStore";
import {
  createImageElement,
  createShapeElement,
  createTextElement,
} from "@/lib/design/defaults";
import { preloadDesignImage } from "@/lib/design/useDesignImages";
import { resolveDesignFileUrl } from "@/lib/design/fileUrls";
import { uploadFile } from "@/app/admin/_components/orderForms/uploadHelpers";
import { getImageDimensions } from "@/lib/imageDimensions";
import type { AdminDesignAssetJson } from "@/app/api/admin/design-assets/route";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";

type TabId = "text" | "photo" | "clipart" | "shapes" | "background";

const TAB_ICONS: Record<TabId, typeof Type> = {
  text: Type,
  photo: ImageIcon,
  clipart: Sparkles,
  shapes: Shapes,
  background: Palette,
};

/** Ready-made text blocks matching the studio's usual card structure. */
const TEXT_PRESETS: readonly {
  id: "name" | "headline" | "dedication" | "footer";
  fontId: string;
  sizeRatio: number;
  uppercase?: boolean;
  letterSpacingRatio?: number;
}[] = [
  { id: "name", fontId: "greatVibes", sizeRatio: 0.13 },
  { id: "headline", fontId: "playfair", sizeRatio: 0.09 },
  { id: "dedication", fontId: "josefinSans", sizeRatio: 0.045, uppercase: true, letterSpacingRatio: 0.03 },
  { id: "footer", fontId: "josefinSans", sizeRatio: 0.035, uppercase: true, letterSpacingRatio: 0.04 },
];

const BACKGROUND_SWATCHES = [
  "transparent",
  "#ffffff",
  "#000000",
  "#e01b24",
  "#c0143c",
  "#0b57a4",
  "#1a7f37",
  "#0f766e",
  "#7c3aed",
  "#be185d",
  "#f5d0a9",
  "#fde68a",
] as const;

interface DesignSidebarProps {
  canvasWidth: number;
  canvasHeight: number;
}

export default function DesignSidebar({ canvasWidth, canvasHeight }: DesignSidebarProps) {
  const { t } = useLanguageStore();
  const ds = t.admin.designStudio;
  const [tab, setTab] = useState<TabId>("text");
  const addElement = useDesignEditor((s) => s.addElement);
  const backgroundColor = useDesignEditor((s) => s.doc.background.color);
  const setBackgroundColor = useDesignEditor((s) => s.setBackgroundColor);

  const canvas = { width: canvasWidth, height: canvasHeight };

  const tabs: readonly { id: TabId; label: string }[] = [
    { id: "text", label: ds.tabText },
    { id: "photo", label: ds.tabPhoto },
    { id: "clipart", label: ds.tabClipart },
    { id: "shapes", label: ds.tabShapes },
    { id: "background", label: ds.tabBackground },
  ];

  const presetLabels: Record<(typeof TEXT_PRESETS)[number]["id"], string> = {
    name: ds.presetName,
    headline: ds.presetHeadline,
    dedication: ds.presetDedication,
    footer: ds.presetFooter,
  };

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="flex shrink-0 border-b border-gray-200">
        {tabs.map(({ id, label }) => {
          const Icon = TAB_ICONS[id];
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              title={label}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition",
                tab === id
                  ? "border-b-2 border-amber-400 bg-amber-50 text-amber-800"
                  : "border-b-2 border-transparent text-gray-500 hover:text-gray-800",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "text" && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">{ds.textHint}</p>
            {TEXT_PRESETS.map((preset) => {
              const label = presetLabels[preset.id];
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    const fontSizePx = Math.round(
                      Math.min(canvasWidth, canvasHeight) * preset.sizeRatio,
                    );
                    addElement(
                      createTextElement(canvas, {
                        text: label,
                        fontId: preset.fontId,
                        fontSizePx,
                        uppercase: preset.uppercase,
                        letterSpacingPx: preset.letterSpacingRatio
                          ? Math.round(fontSizePx * preset.letterSpacingRatio)
                          : 0,
                      }),
                    );
                  }}
                  className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-left text-sm hover:border-amber-300 hover:bg-amber-50"
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {tab === "photo" && <PhotoPanel canvas={canvas} />}
        {tab === "clipart" && <ClipartPanel canvas={canvas} />}

        {tab === "shapes" && (
          <div className="grid grid-cols-3 gap-2">
            {(["rect", "ellipse", "line"] as const).map((shape) => (
              <button
                key={shape}
                type="button"
                onClick={() => addElement(createShapeElement(canvas, shape))}
                className="flex aspect-square items-center justify-center rounded-md border border-gray-200 hover:border-amber-300 hover:bg-amber-50"
                title={shape === "rect" ? ds.shapeRect : shape === "ellipse" ? ds.shapeEllipse : ds.shapeLine}
              >
                {shape === "rect" && <div className="h-8 w-8 bg-gray-700" />}
                {shape === "ellipse" && <div className="h-8 w-8 rounded-full bg-gray-700" />}
                {shape === "line" && <div className="h-0.5 w-8 bg-gray-700" />}
              </button>
            ))}
          </div>
        )}

        {tab === "background" && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">{ds.bgHint}</p>
            <div className="grid grid-cols-6 gap-2">
              {BACKGROUND_SWATCHES.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setBackgroundColor(color)}
                  title={color}
                  className={cn(
                    "h-9 w-9 rounded-md border-2",
                    backgroundColor === color ? "border-amber-400" : "border-gray-200",
                  )}
                  style={
                    color === "transparent"
                      ? {
                          backgroundImage:
                            "linear-gradient(45deg, #d1d5db 25%, transparent 25%), linear-gradient(-45deg, #d1d5db 25%, transparent 25%)",
                          backgroundSize: "8px 8px",
                        }
                      : { backgroundColor: color }
                  }
                />
              ))}
            </div>
            <label className="block text-xs font-medium text-gray-600">
              {ds.customColor}
              <input
                type="color"
                value={backgroundColor === "transparent" ? "#ffffff" : backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="mt-1 h-9 w-full cursor-pointer rounded-md border border-gray-200"
              />
            </label>
          </div>
        )}
      </div>
    </aside>
  );
}

function PhotoPanel({ canvas }: { canvas: { width: number; height: number } }) {
  const { t } = useLanguageStore();
  const ds = t.admin.designStudio;
  const addElement = useDesignEditor((s) => s.addElement);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (files: File[]) => {
      setBusy(true);
      setError(null);
      try {
        for (const file of files) {
          const dimensions = await getImageDimensions(file);
          const { fileUrl } = await uploadFile(file);
          await preloadDesignImage(fileUrl);
          addElement(createImageElement(canvas, fileUrl, "upload", dimensions));
        }
      } catch (e) {
        console.error(e);
        setError(ds.photoFailed);
      } finally {
        setBusy(false);
      }
    },
    [addElement, canvas, ds.photoFailed],
  );

  return (
    <div className="space-y-2">
      <FileDropzone
        accept="image/*"
        multiple
        disabled={busy}
        onFiles={(files) => void handleFiles(files)}
        className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-8 text-center hover:border-amber-400 hover:bg-amber-50"
        dragActiveClassName="border-amber-400 bg-amber-50"
        ariaLabel={ds.photoHint}
      >
        {busy ? (
          <Loader2 className="h-6 w-6 animate-spin text-amber-700" aria-hidden />
        ) : (
          <Upload className="h-6 w-6 text-gray-400" aria-hidden />
        )}
        <span className="text-sm font-medium text-gray-700">{ds.photoHint}</span>
        <span className="text-xs text-gray-500">{ds.photoFormats}</span>
      </FileDropzone>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function ClipartPanel({ canvas }: { canvas: { width: number; height: number } }) {
  const { t } = useLanguageStore();
  const ds = t.admin.designStudio;
  const addElement = useDesignEditor((s) => s.addElement);
  const [items, setItems] = useState<AdminDesignAssetJson[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (category) params.set("category", category);
      void fetch(`/api/admin/design-assets?${params.toString()}`)
        .then((res) => (res.ok ? res.json() : { items: [], categories: [] }))
        .then((data: { items: AdminDesignAssetJson[]; categories: string[] }) => {
          if (cancelled) return;
          setItems(data.items ?? []);
          setCategories(data.categories ?? []);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, category]);

  const categoryOptions = [
    { value: "", label: ds.allCategories },
    ...categories.map((value) => ({ value, label: value })),
  ];

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-gray-400"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={ds.clipartSearch}
          className="pl-8"
          aria-label={ds.clipartSearch}
        />
      </div>

      {categories.length > 0 && (
        <MenuSelect
          value={category}
          onChange={setCategory}
          options={categoryOptions}
          ariaLabel={ds.allCategories}
        />
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" aria-hidden />
        </div>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-500">{ds.clipartEmpty}</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {items.map((asset) => (
            <button
              key={asset.id}
              type="button"
              title={asset.name}
              onClick={() => {
                void preloadDesignImage(asset.fileKey).then(() => {
                  addElement(
                    createImageElement(canvas, asset.fileKey, "asset", {
                      width: asset.widthPx,
                      height: asset.heightPx,
                    }),
                  );
                });
              }}
              className="flex aspect-square items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-gray-50 p-1 hover:border-amber-300 hover:bg-amber-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveDesignFileUrl(asset.thumbKey ?? asset.fileKey)}
                alt={asset.name}
                className="max-h-full max-w-full object-contain"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

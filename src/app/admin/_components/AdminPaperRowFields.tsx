"use client";

import type { ReactElement } from "react";
import { useMemo } from "react";
import { CircleOff, Palette, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  MenuSelect,
  type MenuSelectOption,
} from "@/components/ui/MenuSelect";
import type { TranslationDictionary } from "@/lib/i18n/types";
import type { PaperType } from "@/app/admin/_lib/constants";
import { PAPER_OPTIONS } from "@/app/admin/_lib/constants";

export interface SlotPaperPrint {
  color: "bw" | "color";
  paperType: PaperType;
  customWidth: string;
  customHeight: string;
  pageCount?: number;
}

export interface AdminPaperRowFieldsProps {
  value: SlotPaperPrint;
  onChange: (next: SlotPaperPrint) => void;
  t: TranslationDictionary;
}

/**
 * Compact paper format + color + custom size for one admin order table row.
 */
export function AdminPaperRowFields({
  value,
  onChange,
  t,
}: AdminPaperRowFieldsProps): ReactElement {
  const paperLabels = useMemo(
    (): Record<PaperType, string> => ({
      A0: t.upload.paperA0,
      A1: t.upload.paperA1,
      A2: t.upload.paperA2,
      A3: t.upload.paperA3,
      A4: t.upload.paperA4,
      A5: t.upload.paperA5,
      A6: t.upload.paperA6,
      other: t.upload.paperOther,
    }),
    [t],
  );

  const paperOptions = useMemo(
    (): MenuSelectOption<PaperType>[] =>
      PAPER_OPTIONS.map((opt) => ({
        value: opt,
        label: paperLabels[opt],
      })),
    [paperLabels],
  );

  function patch(p: Partial<SlotPaperPrint>): void {
    onChange({ ...value, ...p });
  }

  return (
    <div className="flex min-w-0 flex-col gap-2 py-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <MenuSelect<PaperType>
          className="min-w-[6.5rem] max-w-[9rem]"
          value={value.paperType}
          options={paperOptions}
          onChange={(pt) => patch({ paperType: pt })}
          ariaLabel={t.upload.paperSize}
          buttonClassName="h-9 min-h-9 justify-between px-2 text-xs font-medium text-gray-800"
        />
        <div className="inline-flex overflow-hidden rounded-md border border-gray-200">
          <button
            type="button"
            onClick={() => patch({ color: "color" })}
            className={cnBtn(value.color === "color")}
            title={t.upload.colorOption}
          >
            <Palette className="h-3 w-3" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => patch({ color: "bw" })}
            className={cnBtnBw(value.color === "bw")}
            title={t.upload.bwOption}
          >
            <CircleOff className="h-3 w-3" aria-hidden />
          </button>
        </div>
      </div>
      {value.paperType === "other" && (
        <div className="flex items-center gap-1">
          <Input
            type="text"
            inputMode="decimal"
            placeholder={t.upload.widthCm}
            value={value.customWidth}
            onChange={(e) =>
              patch({
                customWidth: e.target.value.replace(/[^0-9.,]/g, ""),
              })
            }
            className="h-8 min-w-0 flex-1 px-2 text-xs"
          />
          <X className="h-3 w-3 shrink-0 text-gray-400" aria-hidden />
          <Input
            type="text"
            inputMode="decimal"
            placeholder={t.upload.heightCm}
            value={value.customHeight}
            onChange={(e) =>
              patch({
                customHeight: e.target.value.replace(/[^0-9.,]/g, ""),
              })
            }
            className="h-8 min-w-0 flex-1 px-2 text-xs"
          />
        </div>
      )}
      {value.pageCount !== undefined ? (
        <p className="text-[10px] text-gray-500">
          {t.admin.pagesCount(value.pageCount)}
        </p>
      ) : null}
    </div>
  );
}

function cnBtn(active: boolean): string {
  return [
    "flex h-8 w-8 items-center justify-center border-r border-gray-200 transition-colors",
    active
      ? "bg-gold text-white"
      : "bg-white text-gray-600 hover:bg-gray-50",
  ].join(" ");
}

function cnBtnBw(active: boolean): string {
  return [
    "flex h-8 w-8 items-center justify-center transition-colors",
    active ? "bg-gray-800 text-white" : "bg-white text-gray-600 hover:bg-gray-50",
  ].join(" ");
}

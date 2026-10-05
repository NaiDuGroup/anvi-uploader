"use client";

import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  MugProductPicker,
  type MugProductOption,
  type MugProductSelection,
} from "@/app/mug/_components/MugProductPicker";
import {
  NotebookProductPicker,
  type NotebookProductOption,
  type NotebookProductSelection,
} from "@/app/notebook/_components/NotebookProductPicker";
import {
  PenProductPicker,
  type PenProductOption,
  type PenProductSelection,
} from "@/app/pen/_components/PenProductPicker";
import { mugProductDisplayName } from "@/lib/mug/mugProductLabels";
import { notebookProductDisplayName } from "@/lib/notebook/notebookProductLabels";
import { penProductDisplayName } from "@/lib/pen/penProductLabels";
import type { Locale, TranslationDictionary } from "@/lib/i18n/types";

export type CatalogSkuPickModalKind = "mug" | "notebook" | "pen";

type T = TranslationDictionary;

function mugSearchMatch(
  items: MugProductOption[],
  qLower: string,
  locale: Locale,
): MugProductOption[] {
  if (!qLower) return items;
  return items.filter((m) => {
    const sku = m.sku.toLowerCase();
    const display = mugProductDisplayName(m, locale).toLowerCase();
    return (
      sku.includes(qLower) ||
      display.includes(qLower) ||
      m.nameRo.toLowerCase().includes(qLower) ||
      m.nameRu.toLowerCase().includes(qLower) ||
      m.nameEn.toLowerCase().includes(qLower)
    );
  });
}

function notebookSearchMatch(
  items: NotebookProductOption[],
  qLower: string,
  locale: Locale,
): NotebookProductOption[] {
  if (!qLower) return items;
  return items.filter((m) => {
    const sku = m.sku.toLowerCase();
    const display = notebookProductDisplayName(m, locale).toLowerCase();
    return (
      sku.includes(qLower) ||
      display.includes(qLower) ||
      m.nameRo.toLowerCase().includes(qLower) ||
      m.nameRu.toLowerCase().includes(qLower) ||
      m.nameEn.toLowerCase().includes(qLower)
    );
  });
}

function penSearchMatch(
  items: PenProductOption[],
  qLower: string,
  locale: Locale,
): PenProductOption[] {
  if (!qLower) return items;
  return items.filter((m) => {
    const sku = m.sku.toLowerCase();
    const display = penProductDisplayName(m, locale).toLowerCase();
    return (
      sku.includes(qLower) ||
      display.includes(qLower) ||
      m.nameRo.toLowerCase().includes(qLower) ||
      m.nameRu.toLowerCase().includes(qLower) ||
      m.nameEn.toLowerCase().includes(qLower)
    );
  });
}

interface CatalogSkuPickModalContentProps {
  kind: CatalogSkuPickModalKind;
  locale: Locale;
  t: T;
  mugItems: MugProductOption[];
  notebookItems: NotebookProductOption[];
  penItems: PenProductOption[];
  mugValue: MugProductSelection | null;
  notebookValue: NotebookProductSelection | null;
  penValue: PenProductSelection | null;
  onSelectMug: (v: MugProductSelection) => void;
  onSelectNotebook: (v: NotebookProductSelection) => void;
  onSelectPen: (v: PenProductSelection) => void;
  onClose: () => void;
}

function CatalogSkuPickModalOpen(
  props: CatalogSkuPickModalContentProps,
): ReactElement {
  const {
    kind,
    locale,
    t,
    mugItems,
    notebookItems,
    penItems,
    mugValue,
    notebookValue,
    penValue,
    onSelectMug,
    onSelectNotebook,
    onSelectPen,
    onClose,
  } = props;
  const [search, setSearch] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const qLower = search.trim().toLowerCase();

  const filteredMugs = useMemo(
    () => mugSearchMatch(mugItems, qLower, locale),
    [mugItems, qLower, locale],
  );

  const filteredNotebook = useMemo(
    () => notebookSearchMatch(notebookItems, qLower, locale),
    [notebookItems, qLower, locale],
  );

  const filteredPens = useMemo(
    () => penSearchMatch(penItems, qLower, locale),
    [penItems, qLower, locale],
  );

  const title = {
    mug: t.admin.newOrderPage.catalogSkuModalTitleMug,
    notebook: t.admin.newOrderPage.catalogSkuModalTitleNotebook,
    pen: t.admin.newOrderPage.catalogSkuModalTitlePen,
  }[kind];

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        aria-label={t.admin.newOrderPage.cancel}
        onClick={onClose}
      />
      <div
        className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white text-gray-900 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-sku-modal-title"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-4 py-4 sm:px-5">
          <h2 id="catalog-sku-modal-title" className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5 shrink-0" aria-hidden />
          </button>
        </div>
        <div className="border-b border-gray-100 px-4 py-3 sm:px-5">
          <Input
            type="search"
            autoComplete="off"
            spellCheck={false}
            placeholder={t.admin.newOrderPage.catalogSkuSearchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-gray-200 text-base sm:text-[15px]"
          />
        </div>
        <div className="min-h-[min(60vh,480px)] flex-1 overflow-y-auto px-3 py-4 sm:px-5">
          {kind === "mug" &&
            mugItems.length > 0 &&
            filteredMugs.length === 0 &&
            !!qLower && (
              <p className="py-14 text-center text-sm text-gray-500">
                {t.admin.newOrderPage.catalogSkuGridEmpty}
              </p>
            )}
          {kind === "mug" && (filteredMugs.length > 0 || mugItems.length === 0) && (
            <MugProductPicker
              omitHeader
              variant="modal"
              items={filteredMugs}
              value={mugValue}
              onChange={(v) => {
                onSelectMug(v);
                onClose();
              }}
              label={title}
              otherLabel={t.mug.mugProductOtherLabel}
              otherHint={t.mug.mugProductOtherHint}
              emptyMessage={t.admin.mugProductCatalogEmpty}
            />
          )}
          {kind === "notebook" &&
            notebookItems.length > 0 &&
            filteredNotebook.length === 0 &&
            !!qLower && (
              <p className="py-14 text-center text-sm text-gray-500">
                {t.admin.newOrderPage.catalogSkuGridEmpty}
              </p>
            )}
          {kind === "notebook" &&
            (filteredNotebook.length > 0 || notebookItems.length === 0) && (
              <NotebookProductPicker
                omitHeader
                variant="modal"
                items={filteredNotebook}
                value={notebookValue}
                onChange={(v) => {
                  onSelectNotebook(v);
                  onClose();
                }}
                label={title}
                otherLabel={t.notebook.notebookProductOtherLabel}
                otherHint={t.notebook.notebookProductOtherHint}
                emptyMessage={t.notebook.notebookProductCatalogEmpty}
              />
            )}
          {kind === "pen" &&
            penItems.length > 0 &&
            filteredPens.length === 0 &&
            !!qLower && (
              <p className="py-14 text-center text-sm text-gray-500">
                {t.admin.newOrderPage.catalogSkuGridEmpty}
              </p>
            )}
          {kind === "pen" && (filteredPens.length > 0 || penItems.length === 0) && (
            <PenProductPicker
              variant="strip"
              items={filteredPens}
              value={penValue}
              onChange={(v) => {
                onSelectPen(v);
                onClose();
              }}
              label={title}
              otherLabel={t.pen.penProductOtherLabel}
              otherHint={t.pen.penProductOtherHint}
              emptyMessage={t.pen.penProductCatalogEmpty}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function CatalogSkuPickModal(
  props: CatalogSkuPickModalContentProps & { open: boolean },
): ReactElement | null {
  const { open, kind, ...rest } = props;
  if (!open) return null;
  return (
    <CatalogSkuPickModalOpen
      key={kind}
      kind={kind}
      {...rest}
    />
  );
}

"use client";

import { Lightbulb } from "lucide-react";
import type { TranslationDictionary } from "@/lib/i18n/types";
import type { TypeHint, TypeHintTarget } from "@/lib/orderTypeHint/orderTypeHint";
import { MIXED_PRODUCT_ICON, PRODUCT_TYPE_ICONS, lineTypeLabel } from "@/lib/productTypeIcons";

/** Mug / notebook / pen are stock items: switching opens the item picker. */
export function typeHintPicksItem(target: TypeHintTarget): boolean {
  return target === "mug" || target === "notebook" || target === "pen";
}

function hintLabel(target: TypeHintTarget, t: TranslationDictionary): string {
  return target === "set" ? t.admin.newOrderPage.typeHint.set : lineTypeLabel(target, t);
}

/**
 * «Подсказка типа» under the product menu of a «Печать на бумаге» row: the
 * order comment / file name names another product. Never switches by itself.
 */
export function LineTypeHint({
  hints,
  t,
  onSwitch,
  onDismiss,
}: {
  hints: readonly TypeHint[];
  t: TranslationDictionary;
  onSwitch: (target: TypeHintTarget) => void;
  onDismiss: () => void;
}) {
  const first = hints[0];
  if (!first) return null;
  const th = t.admin.newOrderPage.typeHint;
  const second = hints[1] && hints[1].target !== "set" ? hints[1] : null;
  const Icon = first.target === "set" ? MIXED_PRODUCT_ICON : PRODUCT_TYPE_ICONS[first.target];
  const SecondIcon = second ? PRODUCT_TYPE_ICONS[second.target as Exclude<TypeHintTarget, "set">] : null;
  const isSet = first.target === "set";
  return (
    <div
      className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50/70 px-2 py-1.5 text-xs text-amber-900"
      role="status"
      data-testid="line-type-hint"
    >
      <div className="flex items-start gap-1.5">
        <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
        <span className="min-w-0">
          {isSet ? (
            th.setHint
          ) : (
            <>
              <Icon className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
              {th.looksLike(hintLabel(first.target, t))}
            </>
          )}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-5">
        {!isSet && (
          <button
            type="button"
            className="rounded-md bg-amber-500 px-2 py-0.5 font-medium text-white hover:bg-amber-600"
            onClick={() => onSwitch(first.target)}
          >
            {typeHintPicksItem(first.target) ? th.pickItem : th.switchTo}
          </button>
        )}
        <button type="button" className="text-amber-800 underline-offset-2 hover:underline" onClick={onDismiss}>
          {th.dismiss}
        </button>
        {second && (
          <span className="text-amber-800/80">
            {th.also}{" "}
            <button
              type="button"
              className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
              onClick={() => onSwitch(second.target)}
            >
              {SecondIcon && <SecondIcon className="h-3 w-3" aria-hidden />}
              {hintLabel(second.target, t)}
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

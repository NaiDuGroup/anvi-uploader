"use client";

import { localizedDtfName } from "@/lib/dtf/stockGarments";
import type { TranslationDictionary } from "@/lib/i18n/types";
import { getProductTypeConfig } from "@/lib/productTypes";
import type { DesignerPrintMethod, DesignerProductType } from "@/lib/printMethods/designerProducts";
import type { UvStockItemJson } from "@/lib/uv/dto";
import type { PrintMethodItemPick } from "@/app/admin/(protected)/orders/new/designerLines";
import { MenuSelect, type MenuSelectOption } from "@/components/ui/MenuSelect";

const CLIENT_ITEM = "__client__";
const CURRENT_OTHER = "__other__";

export interface DesignerLineMethodHeaderProps {
  method: DesignerPrintMethod;
  product: DesignerProductType;
  /** Stock items of the print method (UV or sublimation catalog). */
  items: readonly UvStockItemJson[];
  /** Variant the row is on; null / unknown for «Другое». */
  variantId: string | null;
  onPick: (pick: PrintMethodItemPick) => void;
  t: TranslationDictionary;
  locale: string;
}

/**
 * «UV-печать · Ручка» above a pen / notebook / mug row, with the print
 * method's item picker: another pen keeps the designer line, any other item
 * (or the client's own item in UV) turns the row back into the method's line.
 */
export function DesignerLineMethodHeader({
  method,
  product,
  items,
  variantId,
  onPick,
  t,
  locale,
}: DesignerLineMethodHeaderProps) {
  const methodTitle: string = getProductTypeConfig(method)?.getTitle(t) ?? method;
  const productTitle: string = getProductTypeConfig(product)?.getTitle(t) ?? product;
  const known: boolean = variantId != null && items.some((i) => i.id === variantId);
  const options: MenuSelectOption<string>[] = [
    ...(known ? [] : [{ value: CURRENT_OTHER, label: `${productTitle} · ${t.pen.penProductOtherLabel}` }]),
    ...items.map((item) => ({
      value: item.id,
      label: [localizedDtfName(item.itemNames, locale), item.variantLabel].filter((p) => p).join(" · "),
      description: [localizedDtfName(item.categoryNames, locale), item.sku].filter((p) => p).join(" · "),
    })),
    ...(method === "uv_print" ? [{ value: CLIENT_ITEM, label: t.uv.sources.client }] : []),
  ];
  const itemLabel: string = method === "uv_print" ? t.uv.editor.item : t.sublimation.editor.item;

  return (
    <div className="mb-1.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[12px]">
      <span className="shrink-0 rounded-md bg-gold-light px-1.5 py-0.5 font-medium text-gold-text">
        {methodTitle} · {productTitle}
      </span>
      <MenuSelect<string>
        ariaLabel={itemLabel}
        className="w-auto min-w-[10rem] max-w-full flex-1"
        buttonClassName="min-h-7 px-2 text-[12px]"
        value={known ? variantId! : CURRENT_OTHER}
        options={options}
        onChange={(next) => {
          if (next === CURRENT_OTHER || next === variantId) return;
          onPick(next === CLIENT_ITEM ? { source: "client" } : { source: "stock", variantId: next });
        }}
        popoverMinWidthPx={300}
        searchable={options.length > 8}
      />
    </div>
  );
}

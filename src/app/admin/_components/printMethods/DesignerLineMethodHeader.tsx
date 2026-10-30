"use client";

import type { TranslationDictionary } from "@/lib/i18n/types";
import { getProductTypeConfig } from "@/lib/productTypes";
import type { DesignerPrintMethod, DesignerProductType } from "@/lib/printMethods/designerProducts";
import type { UvStockItemJson } from "@/lib/uv/dto";
import type { PrintMethodItemPick } from "@/app/admin/(protected)/orders/new/designerLines";
import { UvItemPicker } from "@/app/admin/_components/uv/UvItemPicker";

export interface DesignerLineMethodHeaderProps {
  method: DesignerPrintMethod;
  product: DesignerProductType;
  /** Stock items of the print method (UV or sublimation catalog). */
  items: readonly UvStockItemJson[];
  /** Variant the row is on; null / unknown for «Другое». */
  variantId: string | null;
  onPick: (pick: PrintMethodItemPick) => void;
  /** Opens the page's stock picker (every category and print method) instead of this method's own. */
  onOpenPicker?: () => void;
  t: TranslationDictionary;
  locale: string;
  /** Order price type: the item picker shows the dealer price to dealers. */
  customerType?: "retail" | "dealer";
}

/**
 * «UV-печать · Ручка» above a pen / notebook / mug row, with the print
 * method's item picker (every category, photos): another pen keeps the
 * designer line, any other item (or the client's own item in UV) turns the row
 * back into the method's line.
 */
export function DesignerLineMethodHeader({
  method,
  product,
  items,
  variantId,
  onPick,
  onOpenPicker,
  t,
  locale,
  customerType,
}: DesignerLineMethodHeaderProps) {
  const methodTitle: string = getProductTypeConfig(method)?.getTitle(t) ?? method;
  const productTitle: string = getProductTypeConfig(product)?.getTitle(t) ?? product;
  const known: boolean = variantId != null && items.some((i) => i.id === variantId);

  return (
    <div className="mb-1.5 flex min-w-0 flex-col gap-1.5 text-[12px]">
      <span className="w-fit shrink-0 rounded-md bg-gold-light px-1.5 py-0.5 font-medium text-gold-text">
        {methodTitle} · {productTitle}
      </span>
      <UvItemPicker
        customerType={customerType}
        className="max-w-md"
        items={items}
        value={known ? variantId : null}
        emptyLabel={`${productTitle} · ${t.pen.penProductOtherLabel}`}
        onChange={(next) => {
          if (next !== variantId) onPick({ source: "stock", variantId: next });
        }}
        onOpen={onOpenPicker}
        t={t}
        locale={locale}
      />
    </div>
  );
}

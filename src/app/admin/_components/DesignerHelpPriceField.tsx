"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { parseDesignerPrice } from "@/lib/studio/designerHelp";
import { DESIGNER_PRICE_ADMIN_TEXT } from "@/lib/studio/i18n.designer";

/**
 * Settings → studio card: «Помощь дизайнера» price (lei, «from»). Empty =
 * not decided: the shop button says «we'll tell you the price». Saved with
 * the studio card (`studioInfo.designerHelpPriceLei`).
 */
export default function DesignerHelpPriceField({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const { locale } = useLanguageStore();
  const tx = DESIGNER_PRICE_ADMIN_TEXT[locale === "ro" || locale === "en" ? locale : "ru"];
  const [text, setText] = useState(value == null ? "" : String(value));
  const bad = text.trim() !== "" && parseDesignerPrice(text) == null;
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-gray-700">{tx.label}</span>
      <Input
        inputMode="decimal"
        data-setting="designer-help-price"
        value={text}
        placeholder="—"
        aria-invalid={bad}
        className={bad ? "border-red-400" : undefined}
        onChange={(e) => {
          setText(e.target.value);
          const v = e.target.value.trim() === "" ? null : parseDesignerPrice(e.target.value);
          if (e.target.value.trim() === "" || v != null) onChange(v);
        }}
      />
      <span className="text-xs text-gray-400">{tx.hint}</span>
    </label>
  );
}

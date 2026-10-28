"use client";

import { MenuSelect, type MenuSelectOption } from "@/components/ui/MenuSelect";
import { UV_MAX_WHITE_LAYERS } from "@/lib/uv/uvConstants";
import type { UvPrintNorms } from "@/lib/uv/uvPrintNorms";
import { useLanguageStore } from "@/stores/useLanguageStore";

const WHITE_LAYER_VALUES: number[] = Array.from({ length: UV_MAX_WHITE_LAYERS + 1 }, (_, i) => i);

/**
 * «Нормы UV-печати» of a stock item (pen, notebook): how it is usually printed.
 * The order editor starts the item's main zone with these; the operator can
 * change them per order.
 */
export function UvPrintNormsFields({
  value,
  onChange,
  disabled,
}: {
  value: UvPrintNorms;
  onChange: (next: UvPrintNorms) => void;
  disabled?: boolean;
}) {
  const { t } = useLanguageStore();
  const n = t.uv.norms;
  const whiteOptions: MenuSelectOption<number>[] = WHITE_LAYER_VALUES.map((v) => ({
    value: v,
    label: t.uv.editor.whiteLayerOption(v),
  }));
  return (
    <div className="space-y-2 border-t border-gray-200 pt-3">
      <div>
        <p className="text-xs font-semibold text-gray-800">{n.title}</p>
        <p className="text-[11px] text-gray-500">{n.hint}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <MenuSelect<number>
          className="w-44"
          ariaLabel={t.uv.editor.whiteLayers}
          value={value.whiteLayers}
          options={whiteOptions}
          onChange={(whiteLayers) => onChange({ ...value, whiteLayers })}
          disabled={disabled}
        />
        <label className="inline-flex items-center gap-2 text-sm text-gray-800">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300"
            checked={value.varnish}
            onChange={(e) => onChange({ ...value, varnish: e.target.checked })}
            disabled={disabled}
          />
          {t.uv.editor.varnish}
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-gray-800">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300"
            checked={value.primer}
            onChange={(e) => onChange({ ...value, primer: e.target.checked })}
            disabled={disabled}
          />
          {t.uv.editor.primer}
        </label>
      </div>
    </div>
  );
}

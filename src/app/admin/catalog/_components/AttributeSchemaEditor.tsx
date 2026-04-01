"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, GripVertical } from "lucide-react";
import type { useLanguageStore } from "@/stores/useLanguageStore";
import type { AttributeField, AttributeOption } from "@/lib/validations";

interface Props {
  fields: AttributeField[];
  onChange: (fields: AttributeField[]) => void;
  t: ReturnType<typeof useLanguageStore.getState>["t"];
}

const FIELD_TYPES = ["text", "number", "select", "boolean"] as const;

function emptyField(): AttributeField {
  return {
    key: "",
    label: { ro: "", ru: "", en: "" },
    type: "text",
    required: false,
  };
}

function emptyOption(): AttributeOption {
  return { value: "", label: { ro: "", ru: "", en: "" } };
}

export default function AttributeSchemaEditor({ fields, onChange, t }: Props) {
  const updateField = (index: number, patch: Partial<AttributeField>) => {
    const next = [...fields];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const removeField = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
  };

  const addField = () => {
    onChange([...fields, emptyField()]);
  };

  const updateOption = (fieldIdx: number, optIdx: number, patch: Partial<AttributeOption>) => {
    const next = [...fields];
    const opts = [...(next[fieldIdx].options ?? [])];
    opts[optIdx] = { ...opts[optIdx], ...patch };
    next[fieldIdx] = { ...next[fieldIdx], options: opts };
    onChange(next);
  };

  const addOption = (fieldIdx: number) => {
    const next = [...fields];
    const opts = [...(next[fieldIdx].options ?? []), emptyOption()];
    next[fieldIdx] = { ...next[fieldIdx], options: opts };
    onChange(next);
  };

  const removeOption = (fieldIdx: number, optIdx: number) => {
    const next = [...fields];
    const opts = (next[fieldIdx].options ?? []).filter((_, i) => i !== optIdx);
    next[fieldIdx] = { ...next[fieldIdx], options: opts };
    onChange(next);
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">{t.admin.catalogAttributeFields}</h4>
        <Button variant="outline" size="sm" onClick={addField}>
          <Plus className="w-3 h-3" />
          {t.admin.catalogAddField}
        </Button>
      </div>

      {fields.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-4">
          {t.admin.catalogAddField}
        </p>
      )}

      {fields.map((field, fi) => (
        <div key={fi} className="bg-gray-50 rounded-lg p-3 space-y-3 relative group">
          <div className="flex items-center gap-2 mb-1">
            <GripVertical className="w-3.5 h-3.5 text-gray-300" />
            <span className="text-xs font-semibold text-gray-500">
              {t.admin.catalogFieldKey}: {field.key || "..."}
            </span>
            <button
              type="button"
              onClick={() => removeField(fi)}
              className="ml-auto p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="block text-[10px] text-gray-500 mb-0.5">{t.admin.catalogFieldKey} *</label>
              <Input
                value={field.key}
                onChange={(e) => updateField(fi, { key: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") })}
                className="text-xs font-mono h-8"
                placeholder="fieldKey"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-0.5">{t.admin.catalogFieldType}</label>
              <select
                value={field.type}
                onChange={(e) => updateField(fi, { type: e.target.value as AttributeField["type"] })}
                className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-950 h-8"
              >
                {FIELD_TYPES.map((ft) => (
                  <option key={ft} value={ft}>{ft}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => updateField(fi, { required: e.target.checked })}
                  className="h-3.5 w-3.5 rounded border-gray-300 accent-amber-500"
                />
                <span className="text-xs">{t.admin.catalogFieldRequired}</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] text-gray-500 mb-0.5">RO</label>
              <Input
                value={field.label.ro}
                onChange={(e) => updateField(fi, { label: { ...field.label, ro: e.target.value } })}
                className="text-xs h-8"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-0.5">RU</label>
              <Input
                value={field.label.ru}
                onChange={(e) => updateField(fi, { label: { ...field.label, ru: e.target.value } })}
                className="text-xs h-8"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-0.5">EN</label>
              <Input
                value={field.label.en}
                onChange={(e) => updateField(fi, { label: { ...field.label, en: e.target.value } })}
                className="text-xs h-8"
              />
            </div>
          </div>

          {field.type === "number" && (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">{t.admin.catalogFieldMin}</label>
                <Input
                  type="number"
                  value={field.min ?? ""}
                  onChange={(e) => updateField(fi, { min: e.target.value ? Number(e.target.value) : undefined })}
                  className="text-xs h-8"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">{t.admin.catalogFieldMax}</label>
                <Input
                  type="number"
                  value={field.max ?? ""}
                  onChange={(e) => updateField(fi, { max: e.target.value ? Number(e.target.value) : undefined })}
                  className="text-xs h-8"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">{t.admin.catalogFieldDefault}</label>
                <Input
                  type="number"
                  value={String(field.defaultValue ?? "")}
                  onChange={(e) => updateField(fi, { defaultValue: e.target.value ? Number(e.target.value) : undefined })}
                  className="text-xs h-8"
                />
              </div>
            </div>
          )}

          {field.type === "select" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-gray-500 font-medium">{t.admin.catalogFieldOptions}</label>
                <button
                  type="button"
                  onClick={() => addOption(fi)}
                  className="text-[10px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-0.5"
                >
                  <Plus className="w-3 h-3" /> {t.admin.catalogAddOption}
                </button>
              </div>
              {(field.options ?? []).map((opt, oi) => (
                <div key={oi} className="flex items-center gap-1.5 bg-white rounded-md p-1.5 border border-gray-100">
                  <Input
                    value={opt.value}
                    onChange={(e) => updateOption(fi, oi, { value: e.target.value })}
                    className="text-xs h-7 w-20 font-mono flex-shrink-0"
                    placeholder="value"
                  />
                  <Input
                    value={opt.label.ro}
                    onChange={(e) => updateOption(fi, oi, { label: { ...opt.label, ro: e.target.value } })}
                    className="text-xs h-7"
                    placeholder="RO"
                  />
                  <Input
                    value={opt.label.ru}
                    onChange={(e) => updateOption(fi, oi, { label: { ...opt.label, ru: e.target.value } })}
                    className="text-xs h-7"
                    placeholder="RU"
                  />
                  <Input
                    value={opt.label.en}
                    onChange={(e) => updateOption(fi, oi, { label: { ...opt.label, en: e.target.value } })}
                    className="text-xs h-7"
                    placeholder="EN"
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(fi, oi)}
                    className="p-0.5 text-gray-400 hover:text-red-500 flex-shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

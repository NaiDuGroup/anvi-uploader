"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { dtfErrorText } from "@/lib/dtf/dtfClientApi";
import { PrintMethodCode, printMethodHasPriceList } from "@/lib/printMethods/methods";
import type { PrintMethodSettingsMap } from "@/lib/printMethods/settings";
import type { SublimationSettings } from "@/lib/printMethods/sublimationSettings";
import { usePrintMethod } from "@/lib/swr";
import { useLanguageStore } from "@/stores/useLanguageStore";
import PrintMethodSettingsEditor from "./PrintMethodSettingsEditor";
import PrintPresetsEditor, { type Feedback } from "./PrintPresetsEditor";
import SublimationNormsEditor from "./SublimationNormsEditor";

/**
 * A print method's format price list and usage norms. Items live in stock
 * categories marked for the method; consumables on its printer («Принтеры»).
 * Sublimation has no format price list: only norms per category of blanks.
 */
export default function PrintMethodPageClient<C extends PrintMethodCode>({ code }: { code: C }) {
  const { t } = useLanguageStore();
  const text = t.printMethods.methods[code];
  const resource = usePrintMethod(code);
  const [feedback, setFeedback] = useState<Feedback>(null);

  let body: React.ReactNode;
  if (resource.error) {
    body = <p className="text-sm text-red-600">{dtfErrorText(resource.error, t)}</p>;
  } else if (!resource.data) {
    body = (
      <p className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t.printMethods.loading}
      </p>
    );
  } else {
    const { presets, method, categories } = resource.data;
    const presetsKey: string = presets
      .map((p) => `${p.id}:${p.label}:${p.widthCm}:${p.heightCm}:${p.retailPrice}:${p.dealerPrice}:${p.isActive}`)
      .join("|");
    const saveSettings = (settings: PrintMethodSettingsMap[C]): void =>
      void resource.mutate((prev) => (prev ? { ...prev, method: { ...prev.method, settings } } : prev), {
        revalidate: false,
      });
    body = (
      <section className="grid gap-6">
        {feedback && (
          <p className={feedback.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"}>{feedback.text}</p>
        )}
        {code === PrintMethodCode.Sublimation ? (
          <SublimationNormsEditor
            key={(categories ?? []).map((c) => c.code).join("|")}
            initial={method.settings as SublimationSettings}
            categories={categories ?? []}
            onSaved={(settings) => saveSettings(settings as PrintMethodSettingsMap[C])}
            onFeedback={setFeedback}
          />
        ) : (
          <>
            {printMethodHasPriceList(code) && (
              <PrintPresetsEditor
                key={presetsKey}
                code={code}
                initial={presets}
                onChanged={() => resource.mutate()}
                onFeedback={setFeedback}
              />
            )}
            <PrintMethodSettingsEditor
              code={code}
              initial={method.settings}
              onSaved={saveSettings}
              onFeedback={setFeedback}
            />
          </>
        )}
      </section>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6">
      <Link href="/admin/stock" className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="h-4 w-4" />
        {t.admin.navStock}
      </Link>
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">{text.title}</h1>
      <p className="mb-5 mt-1 text-sm text-gray-600">{text.subtitle}</p>
      {body}
    </main>
  );
}

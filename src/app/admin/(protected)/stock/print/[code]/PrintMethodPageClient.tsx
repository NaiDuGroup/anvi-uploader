"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { dtfErrorText } from "@/lib/dtf/dtfClientApi";
import type { PrintMethodCode } from "@/lib/printMethods/methods";
import type { PrintMethodSettingsMap } from "@/lib/printMethods/settings";
import { usePrintMethod } from "@/lib/swr";
import { useLanguageStore } from "@/stores/useLanguageStore";
import PrintMethodSettingsEditor from "./PrintMethodSettingsEditor";
import PrintPresetsEditor, { type Feedback } from "./PrintPresetsEditor";

/**
 * A print method's format price list and usage norms. Items live in stock
 * categories marked for the method; consumables on its printer («Принтеры»).
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
    const { presets, method } = resource.data;
    const presetsKey: string = presets
      .map((p) => `${p.id}:${p.label}:${p.widthCm}:${p.heightCm}:${p.retailPrice}:${p.dealerPrice}:${p.isActive}`)
      .join("|");
    body = (
      <section className="grid gap-6">
        {feedback && (
          <p className={feedback.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"}>{feedback.text}</p>
        )}
        <PrintPresetsEditor
          key={presetsKey}
          code={code}
          initial={presets}
          onChanged={() => resource.mutate()}
          onFeedback={setFeedback}
        />
        <PrintMethodSettingsEditor
          code={code}
          initial={method.settings}
          onSaved={(settings: PrintMethodSettingsMap[C]) =>
            void resource.mutate((prev) => (prev ? { ...prev, method: { ...prev.method, settings } } : prev), {
              revalidate: false,
            })
          }
          onFeedback={setFeedback}
        />
      </section>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6">
      <Link href="/admin/stock" className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="h-4 w-4" />
        {t.admin.navStock}
      </Link>
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">{t.admin.stockSections[code].title}</h1>
      <p className="mb-5 mt-1 text-sm text-gray-600">{text.subtitle}</p>
      {body}
    </main>
  );
}

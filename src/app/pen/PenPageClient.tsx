"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { ArrowLeft, Pencil } from "lucide-react";

interface PenPageClientProps {
  showPublicCabinetLoginCta: boolean;
}

export default function PenPageClient({ showPublicCabinetLoginCta }: PenPageClientProps) {
  const { t } = useLanguageStore();
  const [selectedMode] = useState<"editor">("editor");

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              {t.pen?.productPen ?? "Pixuri personalizate"}
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              {t.pen?.penEditorHint ?? "Creează design 2D pentru pixuri"}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-12 text-center">
        <Pencil className="mx-auto h-16 w-16 text-gray-400" />
        <h3 className="mt-4 text-lg font-semibold text-gray-900">
          {t.pen?.penEditor2DTitle ?? "Editor 2D"}
        </h3>
        <p className="mt-2 text-sm text-gray-600">
          {t.pen?.pen3dPreviewUnavailable ?? "3D-превью недоступно. Editor 2D în dezvoltare."}
        </p>
        <p className="mt-4 text-xs text-gray-500">
          {t.pen?.penComingSoon ?? "Funcționalitatea va fi disponibilă în curând"}
        </p>
      </div>

      {showPublicCabinetLoginCta && (
        <div className="mt-8 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm text-blue-900">
            {t.cabinet?.loginCta ?? "Ai deja cont? Autentifică-te pentru a accesa comenzile tale."}
          </p>
          <Link href="/cabinet/login">
            <Button variant="outline" className="mt-2">
              {t.cabinet?.loginButton ?? "Autentificare"}
            </Button>
          </Link>
        </div>
      )}
    </main>
  );
}

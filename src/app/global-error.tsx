"use client";

import { useEffect } from "react";
import { useLanguageStore } from "@/stores/useLanguageStore";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  const t = useLanguageStore((s) => s.t);

  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <html>
      <body className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full rounded-2xl border border-red-100 bg-white p-8 shadow-sm text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-7 w-7 text-red-500"
              aria-hidden
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-gray-900">
            {t.common.unexpectedError}
          </h1>
          {error.message && (
            <p className="text-sm text-gray-500 break-words">{error.message}</p>
          )}
          {error.digest && (
            <p className="font-mono text-xs text-gray-400">#{error.digest}</p>
          )}
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
          >
            {t.common.tryAgain}
          </button>
        </div>
      </body>
    </html>
  );
}

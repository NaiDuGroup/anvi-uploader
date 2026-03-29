"use client";

import { useEffect, useState, use } from "react";
import { Badge } from "@/components/ui/badge";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Loader2, AlertTriangle } from "lucide-react";

interface TrackingData {
  id: string;
  orderNumber: number;
  status: string;
  issueReason: string | null;
  createdAt: string;
}

export default function TrackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const { t } = useLanguageStore();
  const [data, setData] = useState<TrackingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/track/${token}`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to fetch");
        }
        const trackingData = await res.json();
        setData(trackingData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };
    fetchStatus();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center text-gray-900">
          <div className="flex justify-end mb-4">
            <LanguageSwitcher />
          </div>
          <h1 className="text-xl font-bold text-red-600 mb-2">
            {t.track.errorTitle}
          </h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-start sm:items-center justify-center pt-4 px-4 pb-4 sm:p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center text-gray-900">
        <div className="flex justify-end mb-4">
          <LanguageSwitcher />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t.track.title}</h1>

        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-500 mb-1">{t.common.orderId}</p>
            <p className="text-2xl font-bold text-gray-900">
              #{data?.orderNumber ? String(data.orderNumber).padStart(4, "0") : "—"}
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-500 mb-2">{t.common.status}</p>
            <Badge
              variant={
                data?.status === "Issue"
                  ? "destructive"
                  : data?.status === "Ready" || data?.status === t.clientStatuses.ready
                    ? "success"
                    : "info"
              }
              className="text-base px-4 py-1"
            >
              {data?.status === "Issue" ? t.clientStatuses.issue : data?.status}
            </Badge>
          </div>

          {data?.status === "Issue" && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-left">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-red-700 font-medium mb-1">
                    {t.clientStatuses.issue}
                  </p>
                  {data.issueReason && (
                    <p className="text-sm text-red-600 mb-2">{data.issueReason}</p>
                  )}
                  <p className="text-xs text-red-500">{t.track.issueMessage}</p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-500 mb-1">{t.common.submitted}</p>
            <p className="text-sm">
              {data?.createdAt
                ? new Date(data.createdAt).toLocaleString()
                : "—"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback, useRef, use } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLanguageStore } from "@/stores/useLanguageStore";
import Link from "next/link";
import {
  Loader2,
  AlertTriangle,
  RefreshCw,
  Info,
  Phone,
  Printer,
} from "lucide-react";

const POLL_INTERVAL_MS = 30_000;

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
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);
      try {
        const res = await fetch(`/api/track/${token}`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to fetch");
        }
        const trackingData = await res.json();
        setData(trackingData);
        setError(null);
        setLastUpdated(new Date());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token],
  );

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(() => fetchStatus(), POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStatus]);

  const handleRefresh = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    fetchStatus(true);
    intervalRef.current = setInterval(() => fetchStatus(), POLL_INTERVAL_MS);
  };

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
          <p className="text-gray-600 mb-6">
            {error === "not_found"
              ? t.track.errorNotFound
              : error === "expired"
                ? t.track.errorExpired
                : error}
          </p>

          <div className="space-y-3 text-left">
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <Info className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-700 leading-relaxed">
                {t.track.expiredInfo}
              </p>
            </div>
            <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <Phone className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-700 leading-relaxed">
                {t.track.contactInfo}
              </p>
            </div>
          </div>

          <Button asChild className="w-full mt-6" size="lg">
            <Link href="/">
              <Printer className="w-4 h-4 mr-2" />
              {t.track.newPrint}
            </Link>
          </Button>
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
                data?.status === "issue"
                  ? "destructive"
                  : data?.status === "ready"
                    ? "success"
                    : "info"
              }
              className="text-base px-4 py-1"
              data-testid="track-order-status"
            >
              {data?.status ? t.clientStatuses[data.status as keyof typeof t.clientStatuses] : "—"}
            </Badge>
          </div>

          {data?.status === "issue" && (
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

          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing}
            className="w-full"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            {t.track.refresh}
          </Button>

          {lastUpdated && (
            <p className="text-xs text-gray-400">
              {t.track.lastUpdated}: {lastUpdated.toLocaleTimeString()}
            </p>
          )}

          <div className="space-y-2 text-left pt-2">
            <div className="flex items-start gap-2.5 bg-gray-50 rounded-lg p-3">
              <Info className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-gray-500 leading-relaxed">
                {t.track.expiredInfo}
              </p>
            </div>
            <div className="flex items-start gap-2.5 bg-gray-50 rounded-lg p-3">
              <Phone className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-gray-500 leading-relaxed">
                {t.track.contactInfo}
              </p>
            </div>
          </div>

          <Button asChild variant="outline" className="w-full" size="lg">
            <Link href="/">
              <Printer className="w-4 h-4 mr-2" />
              {t.track.newPrint}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

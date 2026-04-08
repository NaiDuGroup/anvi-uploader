"use client";

import { useEffect, useState, useCallback, use } from "react";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLanguageStore } from "@/stores/useLanguageStore";
import {
  Loader2,
  CheckCircle,
  MessageSquare,
  RotateCw,
  Image as ImageIcon,
  Box,
} from "lucide-react";
import dynamic from "next/dynamic";

const Mug3DPreviewFromUrl = dynamic(
  () =>
    import("@/app/mug/_components/Mug3DPreviewFromUrl").then(
      (m) => m.Mug3DPreviewFromUrl,
    ),
  { ssr: false },
);

interface ApprovalData {
  id: string;
  orderNumber: number;
  status: string;
  layoutImageUrl: string | null;
  approvalFeedback: string | null;
  createdAt: string;
}

type ViewMode = "2d" | "3d";

export default function ApprovePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const { t } = useLanguageStore();

  const [data, setData] = useState<ApprovalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("3d");
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"approved" | "changes_requested" | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/approve/${token}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to fetch");
      }
      setData(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/approve/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      setResult("approved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestChanges = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/approve/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_changes", feedback: feedback.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      setResult("changes_requested");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-dvh bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-dvh bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center text-gray-900">
          <div className="flex justify-end mb-4">
            <LanguageSwitcher />
          </div>
          <h1 className="text-xl font-bold text-red-600 mb-2">
            {t.track.errorTitle}
          </h1>
          <p className="text-gray-600">
            {error === "not_found"
              ? t.track.errorNotFound
              : error === "expired"
                ? t.track.errorExpired
                : error === "not_pending"
                  ? t.approve.alreadyApproved
                  : error}
          </p>
        </div>
      </div>
    );
  }

  if (result) {
    const isApproved = result === "approved";
    return (
      <div className="min-h-dvh bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center text-gray-900">
          <div className="flex justify-end mb-4">
            <LanguageSwitcher />
          </div>
          <CheckCircle
            className={`w-16 h-16 mx-auto mb-4 ${isApproved ? "text-green-500" : "text-amber-500"}`}
          />
          <h1 className="text-2xl font-bold mb-2">
            {isApproved ? t.approve.approvedTitle : t.approve.changesRequestedTitle}
          </h1>
          <p className="text-gray-600">
            {isApproved ? t.approve.approvedMessage : t.approve.changesRequestedMessage}
          </p>
        </div>
      </div>
    );
  }

  const isPending = data?.status === "PENDING_APPROVAL";
  const isAlreadyActed = data?.status === "SENT_TO_WORKSHOP" || data?.status === "CHANGES_REQUESTED";

  return (
    <div className="min-h-dvh bg-gray-50 flex items-start sm:items-center justify-center pt-4 px-4 pb-4 sm:p-4">
      <div className="bg-white rounded-2xl shadow-lg p-5 sm:p-8 max-w-lg w-full text-gray-900">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">{t.approve.title}</h1>
          <LanguageSwitcher />
        </div>

        <p className="text-sm text-gray-600 mb-4">{t.approve.subtitle}</p>

        {data?.orderNumber && (
          <div className="bg-gray-50 rounded-lg p-3 mb-4 text-center">
            <span className="text-sm text-gray-500">{t.common.orderId}: </span>
            <span className="font-mono font-bold">
              #{String(data.orderNumber).padStart(4, "0")}
            </span>
          </div>
        )}

        {/* View mode toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-4">
          <button
            type="button"
            onClick={() => setViewMode("3d")}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${
              viewMode === "3d"
                ? "bg-gold text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Box className="w-4 h-4" />
            {t.approve.preview3d}
          </button>
          <button
            type="button"
            onClick={() => setViewMode("2d")}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${
              viewMode === "2d"
                ? "bg-gold text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            {t.approve.preview2d}
          </button>
        </div>

        {/* Preview */}
        {data?.layoutImageUrl && viewMode === "3d" && (
          <Mug3DPreviewFromUrl imageUrl={data.layoutImageUrl} />
        )}
        {data?.layoutImageUrl && viewMode === "2d" && (
          <div className="rounded-xl border border-gray-200 overflow-hidden mb-4">
            <img
              src={data.layoutImageUrl}
              alt="Mug layout"
              className="w-full"
              style={{ aspectRatio: "2480 / 1134" }}
            />
          </div>
        )}

        {/* Already acted */}
        {isAlreadyActed && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center mt-4">
            <p className="text-sm text-amber-800">
              {data?.status === "SENT_TO_WORKSHOP"
                ? t.approve.alreadyApproved
                : t.approve.alreadyRequested}
            </p>
          </div>
        )}

        {/* Action buttons */}
        {isPending && (
          <div className="mt-5 space-y-3">
            {!showFeedback ? (
              <>
                <Button
                  onClick={handleApprove}
                  className="w-full"
                  size="lg"
                  disabled={submitting}
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  {t.approve.approveButton}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowFeedback(true)}
                  className="w-full"
                  size="lg"
                  disabled={submitting}
                >
                  <MessageSquare className="w-4 h-4" />
                  {t.approve.requestChangesButton}
                </Button>
              </>
            ) : (
              <>
                <label className="block text-sm font-medium mb-1.5">
                  {t.approve.feedbackLabel}
                </label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder={t.approve.feedbackPlaceholder}
                  maxLength={1000}
                  rows={3}
                  className="flex w-full rounded-md border border-gray-200 bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 resize-none"
                  autoFocus
                />
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowFeedback(false)}
                    className="flex-1"
                    size="lg"
                    disabled={submitting}
                  >
                    <RotateCw className="w-4 h-4" />
                    {t.upload.back}
                  </Button>
                  <Button
                    onClick={handleRequestChanges}
                    className="flex-1"
                    size="lg"
                    disabled={submitting}
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <MessageSquare className="w-4 h-4" />
                    )}
                    {t.approve.sendFeedback}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

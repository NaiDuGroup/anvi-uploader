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
import {
  NotebookPaperKindBadge,
} from "@/app/notebook/_components/NotebookPaperKindBadge";
import type { NotebookPaperKind } from "@/lib/notebook/notebookPaperKind";

const Preview3DLoading = () => (
  <div
    className="rounded-xl border border-gray-200 overflow-hidden bg-gradient-to-b from-gray-50 to-gray-100 flex flex-col items-center justify-center gap-3"
    style={{ height: 340 }}
  >
    <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
  </div>
);

const Mug3DPreviewFromUrl = dynamic(
  () =>
    import("@/app/mug/_components/Mug3DPreviewFromUrl").then(
      (m) => m.Mug3DPreviewFromUrl,
    ),
  { ssr: false, loading: Preview3DLoading },
);

const Notebook3DPreviewFromUrl = dynamic(
  () =>
    import("@/app/notebook/_components/Notebook3DPreviewFromUrl").then(
      (m) => m.Notebook3DPreviewFromUrl,
    ),
  { ssr: false, loading: Preview3DLoading },
);

interface MugApprovalData {
  id: string;
  orderNumber: number;
  status: string;
  isWorkshop: boolean;
  productType: "mug";
  layoutImageUrl: string | null;
  mugBodyColorHex: string;
  mugHandleColorHex: string;
  mugInnerColorHex: string;
  mugRimColorHex: string;
  // Print area frozen at order creation (cm × cm @ DPI). Used to size the 2D
  // preview and decide whether the 3D toggle should be shown.
  printWidthCm: number;
  printHeightCm: number;
  printDpi: number;
  has3dPreview: boolean;
  approvalFeedback: string | null;
  createdAt: string;
}

interface NotebookApprovalData {
  id: string;
  orderNumber: number;
  status: string;
  isWorkshop: boolean;
  productType: "notebook";
  layoutImageUrl: string | null;
  notebookCoverColorHex: string;
  notebookStrapColorHex: string;
  notebookBookmarkColorHex: string;
  notebookPaperKind: NotebookPaperKind;
  printWidthCm: number;
  printHeightCm: number;
  printDpi: number;
  has3dPreview: boolean;
  approvalFeedback: string | null;
  createdAt: string;
}

type ApprovalData = MugApprovalData | NotebookApprovalData;

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

  // SKUs without a 3D preview should never show the toggle. Force back to 2D
  // as soon as the data arrives so the layout stays consistent.
  useEffect(() => {
    if (data && !data.has3dPreview && viewMode === "3d") {
      setViewMode("2d");
    }
  }, [data, viewMode]);

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
                  : error === "awaiting_feedback_response"
                    ? t.approve.alreadyRequested
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

  const isApprovalOpen =
    !!data &&
    data.status === "IN_PROGRESS" &&
    !data.isWorkshop &&
    !(data.approvalFeedback ?? "").trim();

  const isAwaitingStudioRevision =
    !!data &&
    data.status === "IN_PROGRESS" &&
    !data.isWorkshop &&
    Boolean((data.approvalFeedback ?? "").trim());

  const CLIENT_DONE_STATUSES = new Set([
    "SENT_TO_WORKSHOP",
    "WORKSHOP_PRINTING",
    "WORKSHOP_READY",
    "RETURNED_TO_STUDIO",
    "DELIVERED",
  ]);

  const isPastClientApprovalStep =
    !!data && (data.isWorkshop || CLIENT_DONE_STATUSES.has(data.status));

  const showAlreadyApprovedBanner =
    isPastClientApprovalStep && !isAwaitingStudioRevision;

  return (
    <div className="min-h-dvh bg-gray-50 flex items-start sm:items-center justify-center pt-4 px-4 pb-4 sm:p-4">
      <div className="bg-white rounded-2xl shadow-lg p-5 sm:p-8 max-w-lg w-full text-gray-900">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">{t.approve.title}</h1>
          <LanguageSwitcher />
        </div>

        <p className="text-sm text-gray-600 mb-4">{t.approve.subtitle}</p>

        {data?.orderNumber && (
          <div className="bg-gray-50 rounded-lg p-3 mb-4 flex flex-wrap items-center justify-center gap-2 text-center">
            <span className="text-sm text-gray-500">{t.common.orderId}: </span>
            <span className="font-mono font-bold">
              #{String(data.orderNumber).padStart(4, "0")}
            </span>
            {data.productType === "notebook" && (
              <NotebookPaperKindBadge kind={data.notebookPaperKind} size="sm" />
            )}
          </div>
        )}

        {/* View mode toggle — only when the SKU actually has a 3D preview. */}
        {data?.has3dPreview && (
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
        )}

        {/* Preview */}
        {data?.layoutImageUrl && data.has3dPreview && viewMode === "3d" && data.productType === "mug" && (
          <Mug3DPreviewFromUrl
            imageUrl={data.layoutImageUrl}
            bodyColorHex={data.mugBodyColorHex}
            handleColorHex={data.mugHandleColorHex}
            innerColorHex={data.mugInnerColorHex}
            rimColorHex={data.mugRimColorHex}
          />
        )}
        {data?.layoutImageUrl && data.has3dPreview && viewMode === "3d" && data.productType === "notebook" && (
          <Notebook3DPreviewFromUrl
            imageUrl={data.layoutImageUrl}
            coverColorHex={data.notebookCoverColorHex}
            strapColorHex={data.notebookStrapColorHex}
            bookmarkColorHex={data.notebookBookmarkColorHex}
          />
        )}
        {data?.layoutImageUrl && viewMode === "2d" && (
          <div className="rounded-xl border border-gray-200 overflow-hidden mb-4">
            <img
              src={data.layoutImageUrl}
              alt="Layout"
              className="w-full"
              // Aspect ratio comes from the snapshot so non-default products render
              // without distortion.
              style={{
                aspectRatio: `${data.printWidthCm} / ${data.printHeightCm}`,
              }}
            />
          </div>
        )}

        {isAwaitingStudioRevision && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center mt-4">
            <p className="text-sm text-amber-800">{t.approve.alreadyRequested}</p>
          </div>
        )}

        {showAlreadyApprovedBanner && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center mt-4">
            <p className="text-sm text-amber-800">{t.approve.alreadyApproved}</p>
          </div>
        )}

        {/* Action buttons */}
        {isApprovalOpen && (
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

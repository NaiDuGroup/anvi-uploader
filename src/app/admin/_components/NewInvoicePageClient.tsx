"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n";
import type { SerializedCompanyProfile } from "@/lib/invoice/companyProfile";
import type { SerializedInvoice } from "@/lib/invoice/invoiceSerialization";
import { formatCurrency } from "@/lib/invoice/invoiceDisplay";
import { useCompanyProfile } from "@/lib/swr";
import ClientPicker, {
  type ClientPickerValue,
} from "./ClientPicker";
import OrderPickerModal from "./invoices/OrderPickerModal";
import { ClientFormModal } from "./ClientFormModal";
import { DatePicker } from "./DatePicker";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { PageSkeleton } from "./PageSkeleton";
import { parseAmountMdl, round2 as round2Mdl } from "@/lib/money";

interface DraftLine {
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  /**
   * The displayed line total. Kept in sync with `unitPrice` and `quantity`
   * via {@link recomputeLine}. When the user edits this field directly we
   * back-solve `unitPrice = total / qty`, which lets them type the desired
   * amount and have the unit price filled in for them.
   */
  lineTotal: string;
  /**
   * Tracks which of `unitPrice` / `lineTotal` the user touched last, so that
   * editing `quantity` recomputes the *other* field (preserving the user's
   * intent).
   */
  lastEdited: "price" | "total";
  orderId: string | null;
  orderNumber: number | null;
}

const emptyLine = (): DraftLine => ({
  description: "",
  unit: "buc",
  quantity: "1",
  unitPrice: "0",
  lineTotal: "0",
  lastEdited: "price",
  orderId: null,
  orderNumber: null,
});

/**
 * Local invoice-shaped parser: same semantics as {@link parseAmountMdl}
 * but returns `0` (not `null`) for empty/invalid input. Invoice draft
 * lines treat blank fields as zero rather than "missing".
 */
function parseAmount(s: string): number {
  return parseAmountMdl(s) ?? 0;
}

/** Round to 2 decimals (matches server-side rounding in computeInvoiceTotals). */
const round2 = round2Mdl;

/** Format a number for use in a numeric input (drops trailing zeros sensibly). */
function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return round2(n).toFixed(2);
}

/**
 * Reconciles `unitPrice` and `lineTotal` for a draft line based on which one
 * was last edited. `quantity` is always treated as authoritative.
 *
 * - `lastEdited === "price"`: lineTotal = qty * unitPrice
 * - `lastEdited === "total"`: unitPrice = total / qty (then re-derive lineTotal
 *   from the rounded unitPrice so the displayed total matches what the server
 *   will store, avoiding sub-cent drift).
 */
function recomputeLine(line: DraftLine): DraftLine {
  const qty = parseAmount(line.quantity);
  if (line.lastEdited === "total") {
    const total = parseAmount(line.lineTotal);
    if (qty <= 0) {
      return { ...line, unitPrice: "0" };
    }
    const unitPrice = round2(total / qty);
    const reconciledTotal = round2(qty * unitPrice);
    return {
      ...line,
      unitPrice: formatMoney(unitPrice),
      lineTotal: formatMoney(reconciledTotal),
    };
  }
  const unitPrice = parseAmount(line.unitPrice);
  const total = round2(qty * unitPrice);
  return { ...line, lineTotal: formatMoney(total) };
}

export default function NewInvoicePageClient({
  initialClientId,
}: {
  initialClientId: string | null;
}) {
  const { companyProfile, error, isLoading } = useCompanyProfile();

  if (error) {
    return (
      <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-5">
        <p
          role="alert"
          className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200"
        >
          {error instanceof Error ? error.message : "Failed to load"}
        </p>
      </main>
    );
  }

  if (isLoading || !companyProfile) return <PageSkeleton variant="detail" />;

  return (
    <NewInvoiceForm
      companyProfile={companyProfile}
      initialClientId={initialClientId}
    />
  );
}

function NewInvoiceForm({
  companyProfile,
  initialClientId,
}: {
  companyProfile: SerializedCompanyProfile;
  initialClientId: string | null;
}) {
  const router = useRouter();
  const { t, locale } = useLanguageStore();

  const [client, setClient] = useState<ClientPickerValue | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [issueDate, setIssueDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [validityDays, setValidityDays] = useState<number>(
    companyProfile.invoiceValidityDays,
  );
  const [pdfLocale, setPdfLocale] = useState<Locale>(locale);
  const [notes, setNotes] = useState<string>("");
  const [orderPickerOpen, setOrderPickerOpen] = useState(false);
  const [clientFormOpen, setClientFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState<"" | "draft" | "issue">("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Preload client if initialClientId came via query param.
  useEffect(() => {
    if (!initialClientId) return;
    fetch(`/api/admin/clients/${initialClientId}`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as ClientPickerValue;
        setClient(data);
      })
      .catch(() => {});
  }, [initialClientId]);

  // Keep PDF locale aligned with current UI lang until user explicitly overrides.
  const [pdfLocaleTouched, setPdfLocaleTouched] = useState(false);
  useEffect(() => {
    if (!pdfLocaleTouched) setPdfLocale(locale);
  }, [locale, pdfLocaleTouched]);

  const totals = useMemo(() => {
    // Sum the per-line `lineTotal` shown to the user. Because each line is
    // reconciled via recomputeLine() these values match what the server will
    // compute from the same (qty, unitPrice) pair.
    let subtotal = 0;
    for (const line of lines) {
      subtotal += parseAmount(line.lineTotal);
    }
    subtotal = round2(subtotal);
    const vatAmount = round2(subtotal / 6); // 20% inclusive
    return { subtotal, vatAmount, totalAmount: subtotal };
  }, [lines]);

  function patchLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? recomputeLine({ ...l, ...patch }) : l)),
    );
  }
  function removeLine(index: number) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }
  function addBlankLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function handleClientPicked(c: ClientPickerValue | null) {
    setClient(c);
    if (!c) {
      // Drop linked-order fields if any (they were tied to that client).
      setLines((prev) =>
        prev.map((l) => ({ ...l, orderId: null, orderNumber: null })),
      );
    }
  }

  function buildPayload() {
    return {
      clientId: client?.id ?? "",
      locale: pdfLocale,
      issueDate,
      validityDays,
      notes: notes.trim() || null,
      lineItems: lines
        .filter((l) => l.description.trim().length > 0)
        .map((l) => ({
          description: l.description.trim(),
          unit: l.unit.trim() || "buc",
          quantity: parseAmount(l.quantity),
          unitPrice: parseAmount(l.unitPrice),
          orderId: l.orderId ?? undefined,
        })),
    };
  }

  function validate(): string | null {
    if (!client) return t.invoices.errorClientRequired;
    const filled = lines.filter((l) => l.description.trim().length > 0);
    if (filled.length === 0) return t.invoices.errorLineItemsRequired;
    return null;
  }

  async function handleSaveDraft() {
    const err = validate();
    if (err) {
      setErrorMessage(err);
      return;
    }
    setErrorMessage(null);
    setSubmitting("draft");
    try {
      const res = await fetch("/api/admin/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body?.error ?? "Save failed");
      }
      const data = (await res.json()) as { invoice: SerializedInvoice };
      router.push(`/admin/invoices/${data.invoice.id}`);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSubmitting("");
    }
  }

  async function handleIssueInvoice() {
    const err = validate();
    if (err) {
      setErrorMessage(err);
      return;
    }
    setErrorMessage(null);
    setSubmitting("issue");
    try {
      // 1) Create draft.
      const createRes = await fetch("/api/admin/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!createRes.ok) {
        const body = (await createRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(body?.error ?? "Save failed");
      }
      const createData = (await createRes.json()) as {
        invoice: SerializedInvoice;
      };
      const draft = createData.invoice;
      // 2) Issue it.
      const issueRes = await fetch(`/api/admin/invoices/${draft.id}/issue`, {
        method: "POST",
      });
      if (!issueRes.ok) {
        const body = (await issueRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(body?.error ?? t.invoices.issueFailed);
      }
      router.push(`/admin/invoices/${draft.id}`);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : t.invoices.issueFailed);
    } finally {
      setSubmitting("");
    }
  }

  function handlePickOrder(order: { id: string; orderNumber: number; productLabel: string; price: number | null }) {
    setLines((prev) => [
      ...prev,
      recomputeLine({
        description: `${t.invoices.detailLinkedOrder(order.orderNumber)} — ${order.productLabel}`,
        unit: "buc",
        quantity: "1",
        unitPrice: order.price != null ? String(order.price) : "0",
        lineTotal: "0",
        lastEdited: "price",
        orderId: order.id,
        orderNumber: order.orderNumber,
      }),
    ]);
    setOrderPickerOpen(false);
  }

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-5">
      <button
        type="button"
        onClick={() => router.push("/admin/invoices")}
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        {t.invoices.backToList}
      </button>

      <h1 className="mb-6 text-2xl font-bold text-gray-900">
        {t.invoices.newTitle}
      </h1>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Section
            title={t.invoices.payerSection}
            actions={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setClientFormOpen(true)}
              >
                <UserPlus className="h-4 w-4" />
                {t.invoices.payerCreate}
              </Button>
            }
          >
            <ClientPicker value={client} onChange={handleClientPicked} t={t.admin} />
            {client?.kind === "LEGAL" && !client.companyIdno && (
                <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
                  {t.invoices.payerMissingFields}
                </p>
              )}
          </Section>

          <Section
            title={t.invoices.itemsSection}
            actions={
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setOrderPickerOpen(true)}
                  disabled={!client}
                  title={!client ? t.invoices.fromOrderSelectClientFirst : undefined}
                >
                  <Plus className="h-4 w-4" />
                  {t.invoices.itemsAddFromOrder}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addBlankLine}
                >
                  <Plus className="h-4 w-4" />
                  {t.invoices.itemsAddLine}
                </Button>
              </div>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="pb-2 pr-2">{t.invoices.itemsHeaderArticle}</th>
                    <th className="pb-2 pr-2 w-20">{t.invoices.itemsHeaderQty}</th>
                    <th className="pb-2 pr-2 w-20">{t.invoices.itemsHeaderUnit}</th>
                    <th className="pb-2 pr-2 w-32">
                      {t.invoices.itemsHeaderPrice}
                    </th>
                    <th className="pb-2 pr-2 w-32 text-right">
                      {t.invoices.itemsHeaderTotal}
                    </th>
                    <th className="w-8 pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={index} className="align-top">
                      <td className="py-1 pr-2">
                        <textarea
                          value={line.description}
                          onChange={(e) =>
                            patchLine(index, { description: e.target.value })
                          }
                          placeholder={t.invoices.itemsDescriptionPlaceholder}
                          rows={1}
                          className="block w-full resize-y appearance-none rounded-md border border-gray-200 bg-white px-3 py-2 font-sans text-sm leading-5 text-gray-900 shadow-sm outline-none placeholder:text-gray-400 focus-visible:ring-1 focus-visible:ring-gray-950"
                        />
                        {line.orderNumber != null ? (
                          <p className="mt-1 text-[11px] text-gray-500">
                            {t.invoices.itemsLinkedOrder(line.orderNumber)}
                          </p>
                        ) : null}
                      </td>
                      <td className="py-1 pr-2">
                        <Input
                          type="number"
                          min={0}
                          step="0.001"
                          value={line.quantity}
                          onChange={(e) =>
                            patchLine(index, { quantity: e.target.value })
                          }
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <Input
                          value={line.unit}
                          onChange={(e) =>
                            patchLine(index, { unit: e.target.value })
                          }
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.unitPrice}
                          onChange={(e) =>
                            patchLine(index, {
                              unitPrice: e.target.value,
                              lastEdited: "price",
                            })
                          }
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.lineTotal}
                          onChange={(e) =>
                            patchLine(index, {
                              lineTotal: e.target.value,
                              lastEdited: "total",
                            })
                          }
                          className="text-right"
                          aria-label={t.invoices.itemsHeaderTotal}
                        />
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeLine(index)}
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                          disabled={lines.length === 1}
                          aria-label={t.invoices.itemsRemove}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title={t.invoices.paramsSection}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.invoices.paramIssueDate}>
                <DatePicker
                  value={issueDate}
                  onChange={(next) => setIssueDate(next)}
                  locale={locale}
                  t={t}
                  clearable={false}
                  ariaLabel={t.invoices.paramIssueDate}
                />
              </Field>
              <Field label={t.invoices.paramValidityDays}>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={validityDays}
                  onChange={(e) =>
                    setValidityDays(Number(e.target.value) || 1)
                  }
                />
              </Field>
              <Field label={t.invoices.paramLocale}>
                <MenuSelect<Locale>
                  value={pdfLocale}
                  options={LOCALES.map((l) => ({
                    value: l,
                    label: LOCALE_LABELS[l],
                  }))}
                  onChange={(next) => {
                    setPdfLocaleTouched(true);
                    setPdfLocale(next);
                  }}
                  ariaLabel={t.invoices.paramLocale}
                />
              </Field>
            </div>
            <div className="mt-4">
              <Field label={t.invoices.paramNotes}>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  placeholder={t.invoices.notesPlaceholder}
                  className="block w-full resize-y appearance-none rounded-md border border-gray-200 bg-white px-3 py-2 font-sans text-sm leading-5 text-gray-900 shadow-sm outline-none placeholder:text-gray-400 focus-visible:ring-1 focus-visible:ring-gray-950"
                />
              </Field>
            </div>
          </Section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              {t.invoices.totalsSection}
            </h2>
            <dl className="space-y-2 text-sm">
              <Row
                label={t.invoices.totalSubtotal}
                value={formatCurrency(totals.subtotal, companyProfile.currency)}
              />
              <Row
                label={t.invoices.totalVat}
                value={formatCurrency(totals.vatAmount, companyProfile.currency)}
                muted
              />
              <Row
                label={t.invoices.totalDue}
                value={formatCurrency(totals.totalAmount, companyProfile.currency)}
                strong
              />
            </dl>
          </div>

          <div className="space-y-2">
            <Button
              className="w-full"
              onClick={handleIssueInvoice}
              disabled={submitting !== ""}
            >
              {submitting === "issue" ? t.invoices.issuing : t.invoices.issueAndDownload}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleSaveDraft}
              disabled={submitting !== ""}
            >
              {submitting === "draft" ? t.invoices.saving : t.invoices.saveDraft}
            </Button>
            {errorMessage ? (
              <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
                {errorMessage}
              </p>
            ) : null}
          </div>
        </aside>
      </div>

      {orderPickerOpen && client ? (
        <OrderPickerModal
          clientId={client.id}
          onClose={() => setOrderPickerOpen(false)}
          onPick={handlePickOrder}
        />
      ) : null}

      {clientFormOpen ? (
        <ClientFormModal
          t={t}
          initial={null}
          onClose={() => setClientFormOpen(false)}
          onSaved={(saved) => {
            setClient({
              id: saved.id,
              kind: saved.kind,
              phone: saved.phone,
              personName: saved.personName,
              companyName: saved.companyName,
              companyIdno: saved.companyIdno,
            });
            setClientFormOpen(false);
          }}
        />
      ) : null}
    </main>
  );
}

function Section({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          {title}
        </h2>
        {actions}
      </header>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-gray-700">{label}</span>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  strong,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between ${
        strong ? "border-t border-gray-100 pt-2 text-base font-bold text-gray-900" : ""
      } ${muted ? "text-xs text-gray-500" : ""}`}
    >
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

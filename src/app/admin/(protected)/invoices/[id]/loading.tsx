/**
 * Suspense fallback for `/admin/invoices/[id]`.
 *
 * Without this file Next.js streams the invoice detail RSC silently
 * for the 1-2 s it takes to run `prisma.invoice.findUnique` against
 * Neon EU plus `getOrCreateCompanyProfile`, and the user just stares
 * at the invoice list with no indication that the click was received.
 * Placing a route-scoped loading.tsx here gives Next.js a Suspense
 * boundary tied to the new URL, so the user sees an immediate spinner
 * while the page payload streams.
 */
export default function AdminInvoiceDetailLoading() {
  return (
    <div
      className="flex items-center justify-center"
      style={{ minHeight: "60vh" }}
    >
      <div className="app-spinner" />
    </div>
  );
}

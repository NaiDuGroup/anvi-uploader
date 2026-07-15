/** Fetch the reconciliation-act PDF and trigger a same-tab file download. */
export async function downloadActPdf(
  idno: string,
  locale: string,
  fileNameHint?: string,
): Promise<void> {
  const url = `/api/admin/reconciliation/act/${encodeURIComponent(idno)}/pdf?locale=${encodeURIComponent(locale)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`PDF download failed (${res.status})`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = `${(fileNameHint || "act").replace(/[^\w.-]+/g, "_")}-${idno}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

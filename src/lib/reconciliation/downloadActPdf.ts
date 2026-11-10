/** Fetch a PDF from an admin route and trigger a same-tab file download. */
export async function downloadPdf(url: string, fileName: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`PDF download failed (${res.status})`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

/** Fetch the reconciliation-act PDF and trigger a same-tab file download. */
export async function downloadActPdf(
  idno: string,
  locale: string,
  fileNameHint?: string,
): Promise<void> {
  const url = `/api/admin/reconciliation/act/${encodeURIComponent(idno)}/pdf?locale=${encodeURIComponent(locale)}`;
  await downloadPdf(url, `${(fileNameHint || "act").replace(/[^\w.-]+/g, "_")}-${idno}.pdf`);
}

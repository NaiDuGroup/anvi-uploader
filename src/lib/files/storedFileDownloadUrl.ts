/**
 * Download URL of a file already stored on an order. Staff use the admin
 * endpoint; a dealer editing their own order in the shared wizard must use the
 * cabinet one (scoped to the dealer's own orders — the staff one answers 401).
 */
export function storedFileDownloadUrl(fileId: string, dealerMode: boolean): string {
  const id = encodeURIComponent(fileId);
  return dealerMode ? `/api/cabinet/files/${id}/download` : `/api/download/${id}`;
}

export type AdminOrderFileRow = {
  id: string;
  orderLineId?: string | null;
  fileName: string;
  fileUrl: string;
  copies: number;
  color: string;
  paperType: string | null;
  pageCount: number | null;
};

export type AdminOrderLineGroup = {
  id: string;
  productType: string;
  mugProductSnapshot?: unknown;
  notebookProductSnapshot?: unknown;
  mugLayoutData?: unknown;
  notebookLayoutData?: unknown;
  largeFormatLineData?: unknown;
  files: AdminOrderFileRow[];
};

/** One screen row: either real `OrderLine`s or a single synthetic line for legacy orders. */
export function lineGroupsFromOrder(order: {
  productType: string;
  files: AdminOrderFileRow[];
  mugProductSnapshot?: unknown;
  notebookProductSnapshot?: unknown;
  mugLayoutData?: unknown;
  notebookLayoutData?: unknown;
  orderLines?: AdminOrderLineGroup[];
}): AdminOrderLineGroup[] {
  if (order.orderLines && order.orderLines.length > 0) {
    const filesByLine = new Map<string, AdminOrderFileRow[]>();
    for (const f of order.files) {
      if (!f.orderLineId) continue;
      const list = filesByLine.get(f.orderLineId);
      if (list) {
        list.push(f);
      } else {
        filesByLine.set(f.orderLineId, [f]);
      }
    }
    return order.orderLines.map((line) => ({
      ...line,
      files: filesByLine.get(line.id) ?? [],
    }));
  }
  return [
    {
      id: "legacy",
      productType: order.productType,
      mugProductSnapshot: order.mugProductSnapshot,
      notebookProductSnapshot: order.notebookProductSnapshot,
      mugLayoutData: order.productType === "mug" ? order.mugLayoutData : undefined,
      notebookLayoutData:
        order.productType === "notebook" ? order.notebookLayoutData : undefined,
      files: order.files,
    },
  ];
}

export function formatOrderLineItemRef(
  orderNumber: number,
  lineIndex: number,
  totalLines: number,
): string {
  return `#${String(orderNumber).padStart(4, "0")}.${lineIndex}/${totalLines}`;
}

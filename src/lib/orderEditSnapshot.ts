/**
 * History view of a DB order line (name + quantity as the staff see it), for
 * the order edit diff (`orderEditDiff.ts`). Server side; kept apart so the
 * history drawer does not load the workshop board code.
 */
import { lineHistorySummary, type RawOrderLine } from "@/lib/workshopBoard/groupLines";
import type { OrderLineHistorySnapshot } from "@/lib/orderEditDiff";

/** A Prisma `OrderLine` with its files (the board reads only the JSON columns + files). */
interface DbLineLike {
  id: string;
  productType: string;
  files: { id: string; fileName: string; fileUrl: string; copies: number; color: string; paperType: string | null; pageCount: number | null }[];
}

export function orderLineHistorySnapshot(line: DbLineLike): OrderLineHistorySnapshot {
  const summary = lineHistorySummary(line as unknown as RawOrderLine);
  const filesKey = line.files
    .map((f) => `${f.fileUrl}·${f.color}·${f.paperType ?? ""}`)
    .sort()
    .join("|");
  return {
    id: line.id,
    productType: line.productType,
    name: summary?.name ?? null,
    qty: summary?.qty ?? null,
    filesKey,
    optionsKey: summary?.optionsKey ?? null,
  };
}


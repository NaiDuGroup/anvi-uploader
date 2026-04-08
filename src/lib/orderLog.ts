import type { UpdateOrderInput } from "@/lib/validations";
import type { Prisma } from "@prisma/client";

export type OrderLogEntry = Omit<Prisma.OrderLogCreateManyInput, "id" | "createdAt">;

interface OldOrderState {
  id: string;
  status: string;
  phone: string;
  isPrio: boolean;
  isPaid: boolean;
  totalPrice: number | null;
  notes: string | null;
  clientName: string | null;
  clientId: string | null;
  issueReason: string | null;
  files: { id: string; fileName: string; copies: number; color: string; paperType: string | null }[];
}

const TRACKED_FIELDS: {
  key: keyof OldOrderState;
  validatedKey: keyof UpdateOrderInput;
}[] = [
  { key: "phone", validatedKey: "phone" },
  { key: "isPrio", validatedKey: "isPrio" },
  { key: "isPaid", validatedKey: "isPaid" },
  { key: "totalPrice", validatedKey: "totalPrice" },
  { key: "notes", validatedKey: "notes" },
  { key: "clientName", validatedKey: "clientName" },
  { key: "clientId", validatedKey: "clientId" },
  { key: "issueReason", validatedKey: "issueReason" },
];

function stringify(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

export function buildUpdateLogEntries(
  oldOrder: OldOrderState,
  validated: UpdateOrderInput,
  userId: string,
): OrderLogEntry[] {
  const entries: OrderLogEntry[] = [];
  const orderId = oldOrder.id;

  if (validated.status !== undefined && validated.status !== oldOrder.status) {
    entries.push({
      orderId,
      userId,
      action: "status_changed",
      field: "status",
      oldValue: oldOrder.status,
      newValue: validated.status,
    });
  }

  for (const { key, validatedKey } of TRACKED_FIELDS) {
    const newVal = validated[validatedKey];
    if (newVal === undefined) continue;
    const oldVal = oldOrder[key];
    if (stringify(oldVal) === stringify(newVal)) continue;

    entries.push({
      orderId,
      userId,
      action: "field_updated",
      field: key,
      oldValue: stringify(oldVal),
      newValue: stringify(newVal),
    });
  }

  if (validated.removeFileIds && validated.removeFileIds.length > 0) {
    for (const fileId of validated.removeFileIds) {
      const file = oldOrder.files.find((f) => f.id === fileId);
      entries.push({
        orderId,
        userId,
        action: "file_removed",
        metadata: { fileId, fileName: file?.fileName ?? "unknown" },
      });
    }
  }

  if (validated.addFiles && validated.addFiles.length > 0) {
    for (const f of validated.addFiles) {
      entries.push({
        orderId,
        userId,
        action: "file_added",
        metadata: { fileName: f.fileName },
      });
    }
  }

  if (validated.updateFiles && validated.updateFiles.length > 0) {
    for (const uf of validated.updateFiles) {
      const oldFile = oldOrder.files.find((f) => f.id === uf.id);
      if (!oldFile) continue;

      const changes: Record<string, { from: string | number | null; to: string | number | null }> = {};
      if (uf.copies !== undefined && uf.copies !== oldFile.copies) {
        changes.copies = { from: oldFile.copies, to: uf.copies };
      }
      if (uf.color !== undefined && uf.color !== oldFile.color) {
        changes.color = { from: oldFile.color, to: uf.color };
      }
      if (uf.paperType !== undefined && uf.paperType !== oldFile.paperType) {
        changes.paperType = { from: oldFile.paperType ?? null, to: uf.paperType ?? null };
      }

      if (Object.keys(changes).length > 0) {
        entries.push({
          orderId,
          userId,
          action: "file_updated",
          metadata: { fileName: oldFile.fileName, fileId: uf.id, changes },
        });
      }
    }
  }

  return entries;
}

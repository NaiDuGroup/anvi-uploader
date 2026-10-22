import { Prisma } from "@prisma/client";
import { PurchaseSyncFailure } from "./dto";

const MAX_DETAIL_LENGTH = 300;

export function classifySyncFailure(error: unknown): PurchaseSyncFailure {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  ) {
    return PurchaseSyncFailure.DatabaseSchemaOutdated;
  }
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.message.startsWith("e-Factura")) {
      return PurchaseSyncFailure.EFacturaUnavailable;
    }
    if (error.name === "TypeError" && /fetch failed/i.test(error.message)) {
      return PurchaseSyncFailure.EFacturaUnavailable;
    }
  }
  return PurchaseSyncFailure.Unknown;
}

/** Short, single-line error text for admins (no stack, no request payloads). */
export function syncFailureDetail(error: unknown): string {
  const raw: string =
    error instanceof Prisma.PrismaClientKnownRequestError
      ? `${error.code}: ${error.message}`
      : error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_DETAIL_LENGTH);
}

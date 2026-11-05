import type { TranslationDictionary } from "@/lib/i18n";
import type { DealerModifyBlock, DealerOrderActionsState } from "@/lib/dealerOrderModify";
import type { ClientVisibleStatus } from "@/lib/validations";

export interface CabinetStatusHintInput {
  status: ClientVisibleStatus;
  /** Dealer edit / cancel state (`dealerOrderActionsState`); «hidden» or absent for retail clients and the track page. */
  dealerActions?: DealerOrderActionsState | null;
  dealerLockReason?: DealerModifyBlock | null;
  /** Studio pickup address (studio info in Settings); empty = no address line. */
  studioAddress?: string | null;
  /** Workshop pickup address; none is configured yet, so usually absent. */
  workshopAddress?: string | null;
}

/**
 * The one line under the client status (cabinet order page, track page).
 * The edit / cancel sentences only appear where the dealer really may (or
 * just lost the right to) change the order — retail clients never see them.
 * The issue reason is not repeated here: it has its own «Что случилось» box.
 */
export function cabinetStatusHint(input: CabinetStatusHintInput, t: TranslationDictionary): string | null {
  const editable = input.dealerActions === "editable";
  const lockedByPrinting = input.dealerActions === "locked" && input.dealerLockReason === "printing";
  const parts: (string | null)[] = [];
  switch (input.status) {
    case "accepted":
      parts.push(
        t.clientStatusText.acceptedHint,
        editable ? t.dealerOrder.editableHint : lockedByPrinting ? t.dealerOrder.lockedPrinting : null,
      );
      break;
    case "queued":
    case "issue":
      // A mixed order may still read «queued» / «issue» while one line already
      // prints — the dealer is locked out then, and the hint must say why.
      parts.push(editable ? t.dealerOrder.editableHint : lockedByPrinting ? t.dealerOrder.lockedPrinting : null);
      break;
    case "printing":
      parts.push(lockedByPrinting ? t.dealerOrder.lockedPrinting : null);
      break;
    case "readyInWorkshop":
      parts.push(input.workshopAddress?.trim() ? t.clientStatusText.pickupAddress(input.workshopAddress.trim()) : null);
      break;
    case "readyInStudio":
      parts.push(input.studioAddress?.trim() ? t.clientStatusText.pickupAddress(input.studioAddress.trim()) : null);
      break;
    case "delivered":
      parts.push(t.clientStatusText.deliveredHint);
      break;
    case "cancelled":
      break;
  }
  const text = parts.filter(Boolean).join(" ");
  return text || null;
}

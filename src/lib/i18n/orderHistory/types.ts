/**
 * Order history drawer («Istoric — #9812»): plain sentences «<Name> (<role>) <verb>…».
 * Every verb phrase below comes WITHOUT the actor; the panel puts the name first.
 */
export interface OrderHistoryDictionary {
  /** «acum: În lucru» next to the title. */
  nowStatus: string;
  today: string;
  yesterday: string;
  roles: {
    admin: string;
    superadmin: string;
    workshop: string;
    client: string;
    dealer: string;
    unknown: string;
  };

  created: string;
  statusChanged: string;
  /** The order status followed its lines (not set by hand). */
  statusDerived: string;
  lineStatusChanged: (lineCode: string) => string;
  urgentOn: string;
  urgentOff: string;
  paidOn: string;
  paidOnline: (provider: string) => string;
  paidOff: string;
  priceSet: (to: string) => string;
  priceChanged: (from: string, to: string) => string;
  priceCleared: string;
  notesChanged: string;
  phoneChanged: (from: string, to: string) => string;
  clientLinked: string;
  clientNameChanged: (from: string, to: string) => string;
  clientCleared: string;
  issueSet: (reason: string) => string;
  issueCleared: string;
  approvalFeedback: string;
  trackingSet: (num: string) => string;
  trackingCleared: string;
  shippedOn: string;
  shippedOff: string;
  fileAdded: (name: string) => string;
  fileRemoved: (name: string) => string;
  fileUpdated: (name: string) => string;
  fileReplaced: (lineCode: string, oldName: string, newName: string) => string;
  fileReplacedShort: (lineCode: string) => string;
  layoutFlagged: (lineCode: string, reason: string) => string;
  layoutCleared: (lineCode: string) => string;
  layoutFixed: (lineCode: string) => string;
  deleted: string;
  restored: string;
  paymentMismatch: (paid: string, total: string) => string;
  dealerEdited: string;
  dealerCancelled: string;
  urgencyDealerOn: (fee: string) => string;
  urgencyDealerOff: string;
  urgencyStaffOff: (fee: string) => string;
  urgencyFeeWaived: (fee: string) => string;
  /** Unknown action / field, or an old edit entry without details. */
  edited: string;

  /** Small grey line under a sentence. */
  reason: (text: string) => string;
  comment: (text: string) => string;
  previousFiles: (count: number) => string;

  /** Parts of the «what changed» summary, joined with « · ». */
  change: {
    lineAdded: (name: string, qty: string | null) => string;
    lineRemoved: (name: string, qty: string | null) => string;
    lineQty: (name: string, from: string, to: string) => string;
    lineProduct: (from: string, to: string) => string;
    lineFiles: (name: string) => string;
    lineOptions: (name: string) => string;
    price: (from: string, to: string) => string;
    client: (from: string, to: string) => string;
    phone: (from: string, to: string) => string;
    notes: string;
  };
  money: (mdl: number) => string;
  pcs: (n: number) => string;
  empty: string;
}

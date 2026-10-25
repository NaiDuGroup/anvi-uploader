/** Error codes returned by the invoice-line posting API (safe to import client-side). */
export enum PostLineError {
  NotFound = "not_found",
  AlreadyDone = "already_done",
  TargetNotFound = "target_not_found",
  InvalidFactor = "invalid_factor",
  /** The hand-entered receipt chosen for linking is gone or already linked. */
  ReceiptNotFound = "receipt_not_found",
  /** Un-posting: the line is not posted / ignored. */
  NotPosted = "not_posted",
  /** Un-posting is only supported for unified stock and ignored lines. */
  UnpostUnsupported = "unpost_unsupported",
  /** Un-posting: part of the received quantity has already been used. */
  StockAlreadyUsed = "stock_already_used",
}

export class PostLineFailure extends Error {
  constructor(readonly code: PostLineError) {
    super(code);
  }
}

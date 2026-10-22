/** Error codes returned by the invoice-line posting API (safe to import client-side). */
export enum PostLineError {
  NotFound = "not_found",
  AlreadyDone = "already_done",
  TargetNotFound = "target_not_found",
  InvalidFactor = "invalid_factor",
  /** The hand-entered receipt chosen for linking is gone or already linked. */
  ReceiptNotFound = "receipt_not_found",
}

export class PostLineFailure extends Error {
  constructor(readonly code: PostLineError) {
    super(code);
  }
}

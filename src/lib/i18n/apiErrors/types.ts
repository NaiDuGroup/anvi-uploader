/** Friendly texts for failed client requests (global error toasts, `describeApiError`). */
export interface ApiErrorsDictionary {
  /** 401 — the session cookie expired. */
  sessionExpired: string;
  /** Button on the 401 toast. */
  signIn: string;
  /** 403. */
  forbidden: string;
  /** Extra line on 403 when the server says only a super admin may do it (staff only). */
  superadminOnly: string;
  /** 404. */
  notFound: string;
  /** 400 / 409 / 422 without a readable server message. */
  rejected: string;
  /** 413. */
  tooLarge: string;
  /** 429. */
  tooManyRequests: string;
  /** 5xx. */
  serverError: string;
  /** Second line on 5xx: nothing was saved. */
  notSaved: string;
  /** fetch threw (offline / DNS / connection reset). */
  offline: string;
  /** Any other status. */
  generic: string;
}

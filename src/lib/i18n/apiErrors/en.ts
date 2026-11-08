import type { ApiErrorsDictionary } from "./types";

export const apiErrorsEn: ApiErrorsDictionary = {
  sessionExpired: "Your session has expired — please sign in again",
  signIn: "Sign in",
  forbidden: "You don't have permission for this action",
  superadminOnly: "Only the main administrator can do this",
  notFound: "Not found — it may have been deleted already",
  rejected: "That didn't work — check the details and try again",
  tooLarge: "The file is too large",
  tooManyRequests: "Too many requests — wait a moment and try again",
  serverError: "Server error",
  notSaved: "Nothing was saved — please try again",
  offline: "No connection — check your internet and try again",
  generic: "Something went wrong — please try again",
};

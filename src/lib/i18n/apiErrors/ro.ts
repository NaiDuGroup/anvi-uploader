import type { ApiErrorsDictionary } from "./types";

export const apiErrorsRo: ApiErrorsDictionary = {
  sessionExpired: "Sesiunea a expirat — conectați-vă din nou",
  signIn: "Conectare",
  forbidden: "Nu aveți drepturi pentru această acțiune",
  superadminOnly: "Doar administratorul principal poate face asta",
  notFound: "Nu a fost găsit — poate a fost deja șters",
  rejected: "Nu s-a reușit — verificați datele și încercați din nou",
  tooLarge: "Fișierul este prea mare",
  tooManyRequests: "Prea multe cereri — așteptați puțin și încercați din nou",
  serverError: "Eroare pe server",
  notSaved: "Datele nu au fost salvate — încercați din nou",
  offline: "Nu există conexiune — verificați internetul și încercați din nou",
  generic: "Ceva nu a mers — încercați din nou",
};

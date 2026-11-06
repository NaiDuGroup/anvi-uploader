/**
 * What a text on a design is for, read from its content: an age / big
 * number («30»), a date («12.06.2026», «2026»), a person's name («Ana»,
 * «Ion Rusu») or any other words. Used when switching template to put each
 * text the customer typed into the slot meant for it. Pure.
 */

export type StudioTextRole = "number" | "date" | "name" | "words";

const DATE_RE = /(?:^|\s)\d{1,2}\s?[./-]\s?\d{1,2}\s?[./-]\s?\d{2,4}(?:\s|$)|^\s*(?:19|20)\d{2}\s*$/;
/** An age or a short count («30», «5»): one to three digits, nothing else. */
const NUMBER_RE = /^\s*\d{1,3}\s*$/;
/** One to four capitalised words of letters («Ana», «Ion Rusu», «Familia Popescu»), «&» / «și» between names allowed. */
const NAME_RE = /^\s*\p{Lu}[\p{L}'’.-]*(?:\s+(?:&|și|и|and|\p{Lu}[\p{L}'’.-]*)){0,4}\s*$/u;

/** A text that reads as a date (wedding day, «2026»). */
export function looksLikeDate(text: string): boolean {
  return DATE_RE.test(text);
}

export function textRole(text: string): StudioTextRole {
  if (NUMBER_RE.test(text)) return "number";
  if (looksLikeDate(text)) return "date";
  if (text.trim().length <= 40 && NAME_RE.test(text)) return "name";
  return "words";
}

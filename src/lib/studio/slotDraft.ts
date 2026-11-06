/**
 * A text field of «Personalizează» (Site, Nume…) keeps what the customer
 * types in its own state, so letters show at once; the document follows in a
 * low-priority update (the whole mug preview redraws per letter). The
 * document then comes back with values the field itself sent — those must
 * not overwrite newer letters (that showed the text late, then the
 * customer typed it again: «anvi.mdanvi.md»). A value the field did not send
 * (undo, «Datele mele», another template) replaces the draft. Pure.
 */

export interface SlotDraft {
  /** What the input shows. */
  draft: string;
  /** Last document value seen. */
  external: string;
  /** Values sent to the document and not seen back yet (oldest first). */
  sent: readonly string[];
}

const MAX_SENT = 64;

export function initSlotDraft(external: string): SlotDraft {
  return { draft: external, external, sent: [] };
}

/** The customer typed `value`: shown now, sent to the document. */
export function typeSlotDraft(s: SlotDraft, value: string): SlotDraft {
  return { ...s, draft: value, sent: [...s.sent, value].slice(-MAX_SENT) };
}

/** The document's value changed to `external` (null = no change to apply). */
export function syncSlotDraft(s: SlotDraft, external: string): SlotDraft | null {
  if (external === s.external) return null;
  const i: number = s.sent.indexOf(external);
  // One of ours arriving late: keep the draft (it may already be newer).
  if (i >= 0) return { ...s, external, sent: s.sent.slice(i + 1) };
  return { draft: external, external, sent: [] };
}

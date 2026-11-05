/**
 * One rule for «is this a thermo-magic (chameleon) mug?», shared by the
 * product look (`mugLook.isMagicMug(item)`) and the 3D view bar
 * (`mugViews.isMagicMug(...texts)`). Such a mug is dark when cold and shows
 * the print with a hot drink; its 3D finish is plain «matte», so the names /
 * slug / SKU are what mark it. Pure.
 */
export const MAGIC_MUG_RE =
  /magic|magică|magica|магик|маджик|хамелеон|chameleon|cameleon|camelion|термо-?маг|термочувств|termosensib|heat[- ]?(?:reveal|sensitive|changing)|colou?r[- ]?changing/i;

/** True when any of the texts (names, slug, SKU, finish name) marks a magic mug. */
export function isMagicMugText(...texts: readonly (string | null | undefined)[]): boolean {
  return texts.some((t) => typeof t === "string" && MAGIC_MUG_RE.test(t));
}

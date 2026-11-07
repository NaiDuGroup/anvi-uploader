/**
 * ANVI Studio (`/studio/<kind>`) is hidden while the owner reviews it: on only
 * with `SHOP_STUDIO_EDITOR=1`, or for a tester pass / staff session
 * (`hasShopTesterAccess`). Pure.
 *
 * Product pages (`/p/<slug>`, mugs / notebooks / pens with an editor) send
 * viewers for whom the Studio is on (`studioEditorAllowed`) to the Studio
 * (`studioEditorPath`); everyone else keeps the old editor (`shopEditorPath`).
 *
 * SWITCHING THE STUDIO ON FOR EVERYONE = ONE PLACE: set the env
 * `SHOP_STUDIO_EDITOR=1` on the server and restart. That opens `/studio/<kind>`
 * and points every product page «Creează în editor» to the Studio. Unset it to
 * go back to staff / testers only. There is no DB switch on purpose.
 */

type Env = Readonly<Record<string, string | undefined>>;

export function isStudioEditorEnabled(env: Env = process.env, opts: { tester?: boolean } = {}): boolean {
  if (env.SHOP_STUDIO_EDITOR?.trim() === "1") return true;
  return opts.tester === true;
}

/**
 * Business cards in the Studio (`/studio/card`) have their OWN gate, because
 * `SHOP_STUDIO_EDITOR=1` is on for everyone in production: on only with
 * `SHOP_STUDIO_CARD=1`, or for a tester pass / staff session. While it is
 * off, customers see the business-card page exactly as before (upload only)
 * and `/studio/card` is a 404. Switching it on for everyone = set the env
 * `SHOP_STUDIO_CARD=1` and restart.
 */
export function isStudioCardEnabled(env: Env = process.env, opts: { tester?: boolean } = {}): boolean {
  if (env.SHOP_STUDIO_CARD?.trim() === "1") return true;
  return opts.tester === true;
}

/**
 * Flyers in the Studio (`/studio/flyer`, «Creează online» on `/p/flyere`)
 * have their OWN gate too: on only with `SHOP_STUDIO_FLYER=1`, or for a
 * tester pass / staff session — `SHOP_STUDIO_EDITOR` and `SHOP_STUDIO_CARD`
 * do not open it. While it is off, the flyer page is exactly the upload page
 * as before and `/studio/flyer` is a 404. Switching it on for everyone = set
 * the env `SHOP_STUDIO_FLYER=1` and restart.
 */
export function isStudioFlyerEnabled(env: Env = process.env, opts: { tester?: boolean } = {}): boolean {
  if (env.SHOP_STUDIO_FLYER?.trim() === "1") return true;
  return opts.tester === true;
}

/**
 * T-shirts / polos / caps in the Studio (`/studio/apparel`, «Creează online»
 * on the DTF product pages) have their OWN gate as well: on only with
 * `SHOP_STUDIO_APPAREL=1`, or for a tester pass / staff session — none of the
 * other Studio flags opens it. While it is off, the DTF product pages are
 * exactly the upload pages as before and `/studio/apparel` is a 404.
 * Switching it on for everyone = set the env `SHOP_STUDIO_APPAREL=1` and restart.
 */
export function isStudioApparelEnabled(env: Env = process.env, opts: { tester?: boolean } = {}): boolean {
  if (env.SHOP_STUDIO_APPAREL?.trim() === "1") return true;
  return opts.tester === true;
}

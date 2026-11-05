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

/**
 * ANVI Studio (`/studio/<kind>`) is hidden while the owner reviews it: on only
 * with `SHOP_STUDIO_EDITOR=1`, or for a tester pass / staff session
 * (`hasShopTesterAccess`). Product pages keep linking the old editor. Pure.
 */

type Env = Readonly<Record<string, string | undefined>>;

export function isStudioEditorEnabled(env: Env = process.env, opts: { tester?: boolean } = {}): boolean {
  if (env.SHOP_STUDIO_EDITOR?.trim() === "1") return true;
  return opts.tester === true;
}

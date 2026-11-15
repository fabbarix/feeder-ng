// B9-49 (A11Y-12): both shell <nav> elements are named "Main" (only one is shown at each size, the other is display: none in a
// browser; jsdom has no stylesheet, so both exist there). Tests pick a bar by its class, never by the old names "Bottom bar" / "Side rail".
const pick = (cls: string): HTMLElement | null => document.querySelector<HTMLElement>(`nav.${cls}`)

/** The phone bottom bar, or null (a chromeless screen has none). */
export const queryBottomBar = (): HTMLElement | null => pick('bottom-bar')
/** The side rail, or null. */
export const querySideRail = (): HTMLElement | null => pick('side-rail')
/** The phone bottom bar; throws when the shell has none. */
export function bottomBarNav(): HTMLElement {
  const el = pick('bottom-bar')
  if (!el) throw new Error('no nav.bottom-bar in the document')
  return el
}
/** The side rail; throws when the shell has none. */
export function sideRailNav(): HTMLElement {
  const el = pick('side-rail')
  if (!el) throw new Error('no nav.side-rail in the document')
  return el
}

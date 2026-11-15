// b9-w2b (main-session ruling): a floating popover (Select, DateField, Popover, Menu) never opens under the floating bottom
// bar. Its "floor" is the bar's top edge while the bar shows, else the viewport bottom. The floor comes from the shell's
// `--nav-top` custom property when it resolves to a length in px (B9-19 exposes it as a registered <length>; today it is an
// unresolved calc() and does not parse), else from measuring the bar element itself.

/** The bottom bar of the app shell (AppShell.tsx). */
export const BOTTOM_BAR_SELECTOR = 'nav.bottom-bar'

/**
 * Pure: the lowest viewport y a popover may reach. `navTop` is the bar's top edge above the viewport bottom (px), or null
 * when no bar shows. A value outside 0..viewportHeight is ignored.
 */
export function floorFrom(viewportHeight: number, navTop: number | null): number {
  if (navTop === null || !Number.isFinite(navTop) || navTop <= 0 || navTop >= viewportHeight) return viewportHeight
  return viewportHeight - navTop
}

/** Pure: a computed custom-property value as px, or null when it is not a plain px length ("84px", "0px"). */
export function parsePx(value: string): number | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)px\s*$/.exec(value)
  return m ? Number(m[1]) : null
}

/** The bar's top edge above the viewport bottom: `--nav-top` when it resolves to px, else the measured bar; null if none shows. */
export function readNavTop(viewportHeight: number, doc: Document = document): number | null {
  const bar = doc.querySelector<HTMLElement>(BOTTOM_BAR_SELECTOR)
  if (!bar) return null
  const rect = bar.getBoundingClientRect()
  // display: none (from 1024, or a chromeless page without the bar) measures 0 × 0.
  if (rect.width === 0 && rect.height === 0) return null
  const fromProperty = parsePx(getComputedStyle(bar).getPropertyValue('--nav-top'))
  if (fromProperty !== null) return fromProperty > 0 ? fromProperty : null
  return viewportHeight - rect.top
}

/**
 * The floor for a popover opened from `anchor`. A trigger inside an open modal dialog (a sheet) is exempt: the sheet and its
 * backdrop cover the bar, which is inert under them, so the popover may use the whole viewport there.
 */
export function floatingFloor(anchor: Element | null, viewportHeight: number = window.innerHeight): number {
  if (anchor?.closest('dialog[open]')) return viewportHeight
  return floorFrom(viewportHeight, readNavTop(viewportHeight, anchor?.ownerDocument ?? document))
}

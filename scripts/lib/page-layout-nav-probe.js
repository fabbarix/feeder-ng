// P12 (docs/design/system.md 8): the bottom-bar probe of the page-layout guard. A plain script with no imports: the driver evaluates
// it in the page (scripts/check-page-layout.mjs), and scripts/test/ds-layout_test.sh loads it with <script src> on static fixtures.
//
// feederNavProbe() scrolls to the end of the page and returns the content boxes of <main> that INTERSECT the floating bottom bar:
// a box partly under it, or entirely under it, is a finding. Only a box that starts below the bar's bottom edge is skipped.
// Each box is measured by its content box (padding and border stay clear of the bar), and only the leaf-most intersecting box is
// reported (an ancestor of a reported box is not reported again). Returns null when there is no bar (from 1024 px).
function feederNavProbe() {
  const bar = document.querySelector('nav.bottom-bar')
  if (!bar || getComputedStyle(bar).display === 'none') return null
  const main = document.querySelector('main') || document.body
  const scrollY = window.scrollY
  window.scrollTo(0, document.documentElement.scrollHeight)
  const bb = bar.getBoundingClientRect()
  const top = bb.top
  const bottom = bb.bottom
  const visible = (e) => {
    const b = e.getBoundingClientRect()
    const s = getComputedStyle(e)
    return b.width > 2 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'
  }
  const hits = []
  for (const e of main.querySelectorAll('*')) {
    // A dialog or a popover in the top layer is above the bar, not under it: its content is not an overlap.
    if (bar.contains(e) || !visible(e) || e.closest('dialog, [popover]')) continue
    const b = e.getBoundingClientRect()
    const s = getComputedStyle(e)
    const cTop = b.top + parseFloat(s.borderTopWidth) + parseFloat(s.paddingTop)
    const cBottom = b.bottom - parseFloat(s.borderBottomWidth) - parseFloat(s.paddingBottom)
    if (cTop >= bottom || cBottom <= top) continue
    // round 3: an intersection of 1 px or less is subpixel rounding at the bar's edge, not a finding
    const overlap = Math.min(cBottom, bottom) - Math.max(cTop, top)
    if (overlap <= 1) continue
    hits.push({ e, px: Math.round(overlap) })
  }
  const leaves = hits.filter((h) => !hits.some((o) => o !== h && h.e.contains(o.e)))
  window.scrollTo(0, scrollY)
  return leaves.slice(0, 3).map((h) => ({ sel: h.e.tagName.toLowerCase() + '.' + (h.e.getAttribute('class') || '').split(' ')[0], px: h.px }))
}

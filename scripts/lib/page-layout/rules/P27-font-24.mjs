// P27 (DS-07, DS-08, plan 3 section 9): at a larger browser text size, every visible text node is one of the type roles at that
// size (board and Cook excluded), and no heading is larger than the page title. Mode: by mode, always fail from B9-55.
//
// Pure (no browser), so vitest tests it (web/src/app/pageLayoutRules.p27.test.ts). `collectP27Metrics` is the in-page census
// probe: it is self-contained so it can be passed to page.evaluate. B9-03's registry loads this module and runs it under the
// `font-24` scenario (scenarios/font-24.mjs).

/** The type roles of styles.css (DS-08), in rem: [role, size]. body-strong, label and chip share a size with body, meta and overline. */
export const ROLE_REM = [
  ['display', 2.125],
  ['title-1', 1.75],
  ['title-2', 1.375],
  ['title-3', 1.125],
  ['body', 0.9375],
  ['meta', 0.8125],
  ['overline', 0.75],
  ['nav', 0.6875],
]

/** A computed size within half a pixel of a role is on it (computed styles round). */
const TOLERANCE_PX = 0.5

/** The role sizes in px at a root font size. */
export function roleSizesPx(rootPx) {
  return ROLE_REM.map(([, rem]) => rem * rootPx)
}

/** Routes P27 does not read: the board and Cook Mode have their own roles (--text-board-*, --text-cook-step-*). */
export function isExempt(route) {
  return /^\/(board|cook)(\/|$)/.test(route)
}

const fmt = (px) => String(Math.round(px * 100) / 100)

/**
 * metrics: { rootPx, h1: number | null, texts: [{ sel, px }], headings: [{ sel, level, px }] }; ctx: { width, route, kind }.
 * Returns [{ rule: 'P27', message }].
 */
export function evaluate(metrics, ctx) {
  if (isExempt(ctx.route)) return []
  const out = []
  const roles = roleSizesPx(metrics.rootPx)
  for (const t of metrics.texts) {
    if (roles.some((r) => Math.abs(t.px - r) <= TOLERANCE_PX)) continue
    out.push({
      rule: 'P27',
      message: `P27 ${t.sel} is ${fmt(t.px)} px, off the type roles at ${fmt(metrics.rootPx)} px text (${roles.map(fmt).join(', ')}); give it a role (system.md 1)`,
    })
  }
  if (metrics.h1 != null) {
    for (const h of metrics.headings) {
      if (h.level === 1 || h.px - metrics.h1 <= TOLERANCE_PX) continue
      out.push({
        rule: 'P27',
        message: `P27 ${h.sel} is ${fmt(h.px)} px, larger than the page title (${fmt(metrics.h1)} px); headings follow title-1 > title-3 > body-strong (system.md 1)`,
      })
    }
  }
  return out
}

/**
 * In-page census probe (runs in the browser through page.evaluate; self-contained). Every element with a visible, non-blank
 * direct text node gives one { sel, px } (deduplicated by selector and size); every visible h1-h6 or [role=heading] gives its
 * level and size. Hidden and visually hidden nodes, and anything inside the board or Cook Mode roots, are skipped.
 */
export function collectP27Metrics() {
  const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize)
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return false
    const cs = getComputedStyle(el)
    return cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden], [aria-hidden="true"], .visually-hidden')
  }
  const sel = (el) => {
    const cls = [...el.classList].filter((c) => !/^(is-|has-)/.test(c)).slice(0, 2)
    return cls.length ? `${el.tagName.toLowerCase()}.${cls.join('.')}` : el.tagName.toLowerCase()
  }
  const main = document.querySelector('main') ?? document.body
  const seen = new Set()
  const texts = []
  for (const el of main.querySelectorAll('*')) {
    if (el.closest('svg, .board-screen, .cook-screen')) continue
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() !== '')
    if (!hasText || !visible(el)) continue
    const px = parseFloat(getComputedStyle(el).fontSize)
    const key = `${sel(el)}|${px}`
    if (seen.has(key)) continue
    seen.add(key)
    texts.push({ sel: sel(el), px })
  }
  const headings = []
  for (const el of main.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')) {
    if (!visible(el)) continue
    const level = /^H\d$/.test(el.tagName) ? Number(el.tagName[1]) : Number(el.getAttribute('aria-level') ?? 2)
    headings.push({ sel: sel(el), level, px: parseFloat(getComputedStyle(el).fontSize) })
  }
  const h1 = document.querySelector('h1')
  return { rootPx, h1: h1 ? parseFloat(getComputedStyle(h1).fontSize) : null, texts, headings }
}

/**
 * The registry's view of P27 (w0b integration): the census lands in the metrics key `p27Census` (probes/p27-census.mjs), which
 * only the font-24 scenarios fill; everywhere else the key is undefined and P27 reports nothing. By mode, always fail from B9-55.
 */
export default {
  id: 'P27',
  title: 'At a 24 px text size: off-role text, or a heading larger than the page title (DS-07, DS-08)',
  always: true, // B9-55: always fail at release (plan section 9)
  evaluate(m, ctx) {
    return m.p27Census ? evaluate(m.p27Census, ctx) : []
  },
}

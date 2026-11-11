// R2-L: the pure part of the page-layout guard (rules P1..P9, route table, modes, profiles).
// Design: docs/dev/design/r2l-page-layout.md. The CDP driver is scripts/check-page-layout.mjs and only calls these.
// Unit-tested from vitest (web/src/app/pageLayoutRules.test.ts), which also proves ROUTES equals web/src/app/pageWidths.ts.

/** Content width per route kind (px); the page container adds the gutters. */
export const PAGE_WIDTH_PX = { narrow: 720, default: 1120, wide: 1480 }

/** [route pattern, width kind]; ":id" is resolved with resolveRoute(). Must equal web/src/app/pageWidths.ts (contract test). */
export const ROUTES = [
  ['/', 'default'], ['/plan', 'wide'], ['/shop', 'wide'], ['/scan', 'narrow'], ['/stock', 'default'],
  ['/recipes', 'wide'], ['/recipes/:id', 'default'], ['/recipes/:id/edit', 'default'], ['/recipes/new', 'default'],
  ['/recipes/import', 'narrow'], ['/recipes/export', 'narrow'], ['/ingredients', 'narrow'], ['/ingredients/:id', 'narrow'],
  ['/products', 'narrow'], ['/products/:id', 'narrow'], ['/settings', 'narrow'], ['/settings/household', 'narrow'],
  ['/settings/members', 'narrow'], ['/settings/meal-slots', 'default'], ['/settings/planning', 'narrow'],
  ['/settings/shops', 'narrow'], ['/settings/shops/:id', 'narrow'], ['/settings/notifications', 'narrow'],
  ['/settings/allowlist', 'narrow'], ['/settings/preferences', 'narrow'], ['/settings/access-requests', 'narrow'],
  ['/settings/recipe-assistant', 'narrow'], ['/board', 'full'],
]

/** quick = what scripts/check.sh runs; full = the six viewports of the UI review (PAGE_LAYOUT=full). */
export const PROFILES = {
  quick: [
    { width: 390, height: 844, mobile: true },
    { width: 1440, height: 900, mobile: false },
    { width: 1920, height: 1080, mobile: false },
  ],
  full: [
    { width: 390, height: 844, mobile: true },
    { width: 820, height: 1180, mobile: false },
    { width: 1180, height: 820, mobile: false },
    { width: 1440, height: 900, mobile: false },
    { width: 1920, height: 1080, mobile: false },
    { width: 2560, height: 1440, mobile: false },
  ],
}

const channels = (c) => (String(c).match(/[\d.]+/g) || []).map(Number)
const lum = ([r, g, b]) => {
  const f = (v) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/** WCAG contrast ratio of two CSS colours ("rgb(...)" / "rgba(...)"); alpha is ignored. */
export function contrastRatio(fg, bg) {
  const [x, y] = [lum(channels(fg)), lum(channels(bg))].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/**
 * Findings for one probe of a page: [{rule, message}], message starting with the rule id.
 * `metrics` is what the driver's in-page probe returns; ctx = {width (viewport), route, kind}.
 */
export function evaluateMetrics(m, { width, kind }) {
  const out = []
  const add = (rule, text) => out.push({ rule, message: `${rule} ${text}` })
  const full = kind === 'full'
  if (m.scrollW > m.clientW) add('P1', `sideways scroll (scrollWidth ${m.scrollW} > ${m.clientW})`)
  if (m.over.length) add('P1', `elements past the right edge: ${m.over.join(', ')}`)
  if (width >= 1024 && !full && m.content.r > m.content.x) {
    const offset = Math.round((m.content.x + m.content.r) / 2 - (m.railR + m.vw) / 2)
    if (Math.abs(offset) > 24) add('P2', `content is off-centre by ${offset}px (content ${m.content.x}-${m.content.r}, area ${m.railR}-${m.vw})`)
    const w = m.content.r - m.content.x
    const max = PAGE_WIDTH_PX[kind]
    if (max !== undefined && w > max + 40) add('P3', `content is ${w}px wide; a ${kind} page is at most ${max}px`)
  }
  for (const f of m.fields) {
    // A Barcode is typed or pasted (up to 14 digits, with a scanner) and uses the numeric keypad, but its field is md by design (R2-3).
    if (width >= 820 && f.short && !f.segment && f.size !== 'full' && f.w > 240 && !/barcode/i.test(f.label)) add('P4', `short field "${f.label}" is ${f.w}px wide (max 240; set size="xs|sm")`)
    if (['text', 'email', 'search', 'url'].includes(f.type) && !f.short && f.w < 160) add('P5', `field "${f.label}" collapsed to ${f.w}px`)
  }
  for (const b of m.bars) {
    if (b.bgAlpha === 0) add('P6', `sticky bar .${b.cls} has a transparent background`)
    if (Math.abs(b.x - m.container.x) > 4 || Math.abs(b.r - m.container.r) > 4) {
      add('P6', `sticky bar .${b.cls} (${b.x}-${b.r}) does not line up with the page container (${m.container.x}-${m.container.r})`)
    }
  }
  if (m.railContrast !== null && m.railContrast < 4.5) add('P7', `current rail item contrast ${m.railContrast}:1 (< 4.5)`)
  if (width >= 768 && m.dialog && (m.dialog.w > 600 || Math.abs(m.dialog.x + m.dialog.w / 2 - m.dialog.vw / 2) > 2)) {
    add('P8', `dialog ${m.dialog.w}px wide at x=${m.dialog.x}`)
  }
  if (!full && m.pageWidthAttr !== kind) add('P9', `the page container says data-page-width="${m.pageWidthAttr}", the route table says "${kind}"`)
  return out
}

const segs = (p) => String(p).split(/[?#]/)[0].split('/').filter(Boolean)
function patternMatches(pattern, route) {
  const p = segs(pattern)
  const r = segs(route)
  const wildcard = p[p.length - 1] === '*'
  const fixed = wildcard ? p.slice(0, -1) : p
  if (wildcard ? r.length < fixed.length : r.length !== fixed.length) return false
  return fixed.every((s, i) => s.startsWith(':') || s === r[i])
}

/** 'warn' | 'fail' for a (resolved) route from the text of scripts/check-page-layout.modes. */
export function modeFor(modesText, route) {
  let dflt = 'warn'
  let failRoutes = []
  for (const raw of String(modesText).split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 0) continue
    const key = line.slice(0, i).trim()
    const value = line.slice(i + 1).trim()
    if (key === 'default') dflt = value === 'fail' ? 'fail' : 'warn'
    if (key === 'fail_routes') failRoutes = value.split(/\s+/).filter(Boolean)
  }
  if (failRoutes.some((pat) => patternMatches(pat, route))) return 'fail'
  return dflt
}

const ID_KEYS = { recipes: 'recipeId', ingredients: 'ingredientId', products: 'productId', shops: 'shopId' }
/** Replaces ":id" with the seeded id of the entity named by the preceding path segment. */
export function resolveRoute(pattern, ids) {
  const parts = pattern.split('/')
  return parts.map((s, i) => (s === ':id' ? String(ids[ID_KEYS[parts[i - 1]]] ?? 1) : s)).join('/')
}

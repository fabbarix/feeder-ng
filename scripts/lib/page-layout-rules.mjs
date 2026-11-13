// R2-L: the pure part of the page-layout guard (rules P1..P9, route table, modes, profiles).
// Design: docs/dev/design/r2l-page-layout.md. The CDP driver is scripts/check-page-layout.mjs and only calls these.
// Unit-tested from vitest (web/src/app/pageLayoutRules.test.ts), which also proves ROUTES equals web/src/app/pageWidths.ts.

/** Content width per route kind (px); the page container adds the gutters. */
export const PAGE_WIDTH_PX = { narrow: 720, default: 1120, wide: 1480 }

/** [route pattern, width kind]; ":id" is resolved with resolveRoute(). Must equal web/src/app/pageWidths.ts (contract test). */
export const ROUTES = [
  ['/', 'wide'], ['/plan', 'wide'], ['/plan/couldnt-plan/excluded', 'default'], ['/shop', 'wide'], ['/scan', 'narrow'], ['/pantry', 'default'],
  ['/recipes', 'wide'], ['/recipes/:id', 'default'], ['/recipes/:id/edit', 'default'], ['/recipes/new', 'default'],
  ['/recipes/import', 'narrow'], ['/recipes/export', 'narrow'], ['/ingredients', 'narrow'], ['/ingredients/:id', 'narrow'],
  ['/products', 'narrow'], ['/products/:id', 'narrow'], ['/settings', 'narrow'], ['/settings/household', 'narrow'],
  ['/settings/members', 'narrow'], ['/settings/meal-slots', 'default'], ['/settings/courses', 'narrow'], ['/settings/planning', 'narrow'], ['/settings/tags', 'narrow'],
  ['/settings/shops', 'narrow'], ['/settings/shops/:id', 'narrow'], ['/settings/notifications', 'narrow'],
  ['/settings/allowlist', 'narrow'], ['/settings/preferences', 'narrow'], ['/settings/access-requests', 'narrow'],
  ['/settings/recipe-assistant', 'narrow'], ['/board', 'full'],
]

/** Rules that fail the guard in every mode, on warn routes too (DS-A round 2, system.md 10): horizontal overflow; P16 (hf-recipes-filter): a crushed chip label. */
export const ALWAYS_FAIL = ['P1', 'P13', 'P15', 'P16', 'P17', 'P18', 'P19', 'P20']

/**
 * hf-recipes-filter round 2: the filtered /recipes the guard also probes, at every width: the chips of a Side Course and a long Tag,
 * closed, and with the Filters panel open (docs/design/recipes-filter.md 13.6). The ids file gives the Course and the Tag
 * (resolveScenario).
 */
export const SCENARIOS = [
  { name: 'recipes-filtered', route: '/recipes', open: false },
  { name: 'recipes-filtered-open', route: '/recipes', open: true },
]

/** The URL of a scenario: its route with the Side Course and the long Tag from the ids file. */
export function resolveScenario(scenario, ids) {
  const params = new URLSearchParams({ course: String(ids.sideCourseId), tag: String(ids.longTag) })
  return `${scenario.route}?${params.toString()}`
}

/** quick = what scripts/check.sh runs, iPad portrait included (DS-A, ADR 0016); full = the six viewports of the UI review (PAGE_LAYOUT=full). */
export const PROFILES = {
  quick: [
    { width: 390, height: 844, mobile: true },
    { width: 834, height: 1194, mobile: false },
    { width: 1024, height: 1366, mobile: false },
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
/** FU-4: the P10 findings of the Button probe run in the dark scheme (none for an undefined or empty list). */
export function darkButtonFindings(lowContrastButtonsDark) {
  return (lowContrastButtonsDark ?? []).map((b) => ({ rule: 'P10', message: `P10 Button "${b.label}" contrast ${b.ratio}:1 (dark scheme)` }))
}

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
    // A numeric-keypad field whose content is long by nature (a 14-digit code) says so with data-size-intent="long" (f.long).
    if (width >= 820 && f.short && !f.segment && f.size !== 'full' && f.w > 240 && !f.long) add('P4', `short field "${f.label}" is ${f.w}px wide (max 240; set size="xs|sm")`)
    // A field that shares a wrapping row with chips (the tag input) says so with data-size-intent="inline" (f.inline).
    if (['text', 'email', 'search', 'url'].includes(f.type) && !f.short && !f.inline && f.w < 160) add('P5', `field "${f.label}" collapsed to ${f.w}px`)
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
  // QA-1: a Button label must reach 4.5:1 on its own background (the probe reports the ones that do not).
  for (const b of m.lowContrastButtons ?? []) add('P10', `Button "${b.label}" contrast ${b.ratio}:1 (< 4.5)`)
  // FU-4: the same probe in the dark scheme (the driver emulates prefers-color-scheme: dark for it).
  out.push(...darkButtonFindings(m.lowContrastButtonsDark))
  // QA-1: text clipped by its box ("clipped") or a word broken across lines ("mid-word").
  // An email or a link is one token that has to wrap somewhere, so a mid-word break inside one ("@", "://" or "/") is allowed.
  for (const b of m.brokenText ?? []) {
    if (b.why === 'mid-word' && /@|:\/\/|\//.test(b.token ?? '')) continue
    add('P11', `${b.sel}: ${b.why}`)
  }
  // DS-A (system.md 8): at the end of a scroll, no content box of <main> is under the floating bottom bar (null: no bar, from 1024 px).
  for (const o of m.navOverlap ?? []) add('P12', `${o.sel} is under the bottom bar by ${o.px} px at the end of the scroll; add clearance (--nav-clearance)`)
  // DS-A round 2 (system.md 10): a box wider than its tile or card spills past it (fails in every mode, see ALWAYS_FAIL).
  for (const o of m.tileOverflow ?? []) add('P13', `${o.sel} spills ${o.px} px past its ${o.card}; give its track min-inline-size: 0 or let it wrap or scroll`)
  // ds-plan round 3: a chip label cut by its ellipsis while its chip line has spare room (a lone chip must show in full).
  for (const c of m.clippedChips ?? []) add('P14', `${c.sel} "${c.label}" is cut by its ellipsis with ${c.room} px spare on its line; let the chips take their natural width (flex 0 1 auto, min-inline-size 0) and no percentage cap`)
  // hf-recipes-filter (docs/design/recipes-filter.md 11): a chip whose label is crushed to its dot (fails in every mode, see ALWAYS_FAIL).
  for (const c of m.crushedChips ?? []) add('P16', `${c.sel} "${c.label}" is crushed to ${c.px} px: its label is cut by its ellipsis; give the chip its natural width (flex 0 1 auto, min-inline-size) and let the line take fewer chips or a "+N"`)
  // hf-recipes-filter round 2 (docs/design/recipes-filter.md 13.6). P17: the chip line shows a cut chip after its first, or a chip past its end.
  for (const f of m.fitLines ?? []) {
    const what = f.why === 'cut' ? `is cut by its ellipsis (${f.px} px of its label) after the first chip` : `runs ${f.px} px past the end of its line`
    add('P17', `${f.sel} "${f.label}" ${what}; a chip that does not fit goes into "+N", it is never shown cut or past the line`)
  }
  // P18: a focus ring (3 px outline, 2 px offset) or a removable chip's 44 px hit area cut by a clipping ancestor.
  for (const c of m.clippedRings ?? []) add('P18', `${c.sel} "${c.label}": its ${c.what} is cut by a clipping ancestor by ${c.px} px; do not clip the line, or pad it by the ring (5 px) and the hit area (9 px)`)
  // P19 (from 768 px): an open popover ends where its trigger ends, and stays inside the page content box.
  const align = m.popoverAlign
  if (width >= 768 && align) {
    if (Math.abs(align.dx) > 1) add('P19', `the open popover's end edge is ${Math.abs(Math.round(align.dx))} px ${align.dx < 0 ? 'inside' : 'past'} its trigger's end edge; end-align it with the trigger`)
    if (align.right > align.contentR + 1 || align.left < align.contentX - 1) {
      add('P19', `the open popover leaves the page content box (x ${Math.round(align.left)} to ${Math.round(align.right)}, content ${Math.round(align.contentX)} to ${Math.round(align.contentR)}); keep it inside the page`)
    }
  }
  // P20: row 3 sits one slot gap below row 2, and two panel sections are at least 12 px apart.
  const spacing = m.filterSpacing
  if (spacing) {
    if (spacing.rowGap !== null && spacing.rowGap < spacing.slotGap - 0.5) add('P20', `row 3 sits ${spacing.rowGap} px below row 2; it must sit one slot gap (${spacing.slotGap} px) below it`)
    if (spacing.sectionGap !== null && spacing.sectionGap < 12) add('P20', `two panel sections are ${spacing.sectionGap} px apart; space them at least 12 px`)
  }
  // DS-TODAY round 2 (system.md 5): an action group must not collapse, a button must hold its label, and no text may run under the
  // actions (fails in every mode, see ALWAYS_FAIL). A probe older than the field (undefined) is clean.
  for (const o of m.actionLayout ?? []) {
    const what = o.why === 'collapsed' ? 'collapsed to 0 px' : o.why === 'label-clipped' ? `clips its label by ${o.px} px` : `runs ${o.px} px under the actions`
    add('P15', `${o.sel} ${what}; give the row a real actions track (max-content) and let the group take its own line on a phone`)
  }
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

/** 'warn' | 'fail' for a (resolved) route from the text of scripts/check-page-layout.modes. `warn_routes` win over `fail_routes`; repeated lines of a key are unioned. */
export function modeFor(modesText, route) {
  let dflt = 'warn'
  let failRoutes = []
  let warnRoutes = []
  for (const raw of String(modesText).split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 0) continue
    const key = line.slice(0, i).trim()
    const value = line.slice(i + 1).trim()
    if (key === 'default') dflt = value === 'fail' ? 'fail' : 'warn'
    // Several lines of the same key are unioned, so every team can add its own line.
    if (key === 'fail_routes') failRoutes = failRoutes.concat(value.split(/\s+/).filter(Boolean))
    if (key === 'warn_routes') warnRoutes = warnRoutes.concat(value.split(/\s+/).filter(Boolean))
  }
  if (warnRoutes.some((pat) => patternMatches(pat, route))) return 'warn'
  if (failRoutes.some((pat) => patternMatches(pat, route))) return 'fail'
  return dflt
}

const ID_KEYS = { recipes: 'recipeId', ingredients: 'ingredientId', products: 'productId', shops: 'shopId' }
/** Replaces ":id" with the seeded id of the entity named by the preceding path segment. */
export function resolveRoute(pattern, ids) {
  const parts = pattern.split('/')
  return parts.map((s, i) => (s === ':id' ? String(ids[ID_KEYS[parts[i - 1]]] ?? 1) : s)).join('/')
}

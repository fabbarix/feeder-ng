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
  ['/supplies', 'narrow'], ['/supplies/:id', 'narrow'], ['/scan/receipt', 'narrow'], ['/scan/receipt/review', 'narrow'],
  ['/products', 'narrow'], ['/products/:id', 'narrow'], ['/settings', 'narrow'], ['/settings/household', 'narrow'],
  ['/settings/members', 'narrow'], ['/settings/meal-slots', 'default'], ['/settings/courses', 'narrow'], ['/settings/planning', 'narrow'], ['/settings/tags', 'narrow'],
  ['/settings/shops', 'narrow'], ['/settings/shops/:id', 'narrow'], ['/settings/notifications', 'narrow'],
  ['/settings/allowlist', 'narrow'], ['/settings/preferences', 'narrow'], ['/settings/access-requests', 'narrow'],
  ['/settings/recipe-assistant', 'narrow'], ['/board', 'full'],
]

/**
 * Rules that fail the guard in every mode, on warn routes too (DS-A round 2, system.md 10): horizontal overflow; P16 (hf-recipes-filter): a
 * crushed chip label; P22 (pantry-filter review): a chip Select's value cut by its ellipsis; P23 (b8-shop): a Shop hint cut by its ellipsis.
 */
export const ALWAYS_FAIL = ['P1', 'P13', 'P15', 'P16', 'P17', 'P18', 'P19', 'P20', 'P21', 'P22', 'P23']

/**
 * hf-recipes-filter round 2: the filtered /recipes the guard also probes, at every width: the chips of a Side Course and a long Tag,
 * closed, and with the Filters panel open (docs/design/recipes-filter.md 13.6). pantry-filter: the same for /pantry, with Use soon and
 * the 60-character Storage Place (docs/design/pantry-filter.md 10). The ids file gives the Course, the Tag and the place
 * (resolveScenario).
 */
export const SCENARIOS = [
  { name: 'recipes-filtered', route: '/recipes', open: false },
  { name: 'recipes-filtered-open', route: '/recipes', open: true },
  { name: 'pantry-filtered', route: '/pantry', open: false },
  { name: 'pantry-filtered-open', route: '/pantry', open: true },
  // beta.7 (H8, docs/dev/design/household-items.md 8): the Supplies list with the quick-Use sheet of a g or ml Supply open, the Supply
  // page, and the Shop list with its Supplies group (the seeded Supply below its Restock level).
  { name: 'supplies-use-sheet', route: '/supplies', start: '/supplies', setup: 'supplyUseSheet', widths: [360, 390, 834, 1440] },
  { name: 'supply-page', route: '/supplies/:id', start: '/supplies/:id', setup: 'supplyPage', widths: [360, 390, 834, 1440] },
  { name: 'shop-supplies-group', route: '/shop', start: '/shop', setup: 'shopSuppliesGroup', widths: [360, 390, 834, 1440] },
  // b8-shop (docs/dev/design/b8-shop.md 1 and 2): the header chips at the phone widths (their icons stay, the values are short), and the
  // Shop's info hints in the card grid, which P23 reads for a cut hint.
  { name: 'shop-header', route: '/shop', start: '/shop', setup: 'shopHeader', widths: [360, 390] },
  { name: 'shop-hints', route: '/shop', start: '/shop', setup: 'shopHints', widths: [360, 390, 834, 1440] },
  // beta.7 (SR6, docs/design/shop-scan-proposals.md 13): the Scan screen in shop mode. A headless Chrome has no camera, so the
  // no-camera block shows and the guard types the seeded codes by hand. The Scanned list with its rows and the "Read the receipt" footer
  // row; a row active with its strip; the Price keypad (a non-modal half sheet on a phone, docked from 768 px); the new-Product sheet.
  { name: 'scan-scanned-list', route: '/scan', start: '/scan', setup: 'scanScannedList', widths: [360, 390, 834] },
  { name: 'scan-row-active', route: '/scan', start: '/scan', setup: 'scanRowActive', widths: [360, 390, 834] },
  { name: 'scan-price-keypad', route: '/scan', start: '/scan', setup: 'scanPriceKeypad', widths: [360, 390, 834] },
  { name: 'scan-new-product', route: '/scan', start: '/scan', setup: 'scanNewProduct', widths: [360, 390, 834] },
  // beta.7 (RR5, docs/design/receipt-reading.md 9): the photos screen with no photo, with one, its photo edit sheet, and the review
  // of a done read (the fake Anthropic API answers the read; internal/recipeassistant/fakeanthropic receipt.go).
  { name: 'receipt-photos-empty', route: '/scan/receipt', start: '/scan', setup: 'receiptPhotosEmpty', widths: [360, 390, 834, 1440] },
  { name: 'receipt-photos-one', route: '/scan/receipt', start: '/scan', setup: 'receiptPhotosOne', widths: [360, 390, 834, 1440] },
  { name: 'receipt-photo-edit', route: '/scan/receipt', start: '/scan', setup: 'receiptPhotoEdit', widths: [360, 390, 834, 1440] },
  { name: 'receipt-review', route: '/scan/receipt/review', start: '/scan', setup: 'receiptReview', widths: [360, 390, 834, 1440] },
]

/**
 * beta.7: the viewport of a scenario width (a scenario with `widths` runs at exactly those, in both profiles). The phone widths are
 * emulated as phones, as the profiles' 390 px is; 834 is the iPad portrait of the quick profile.
 */
export const SCENARIO_VIEWPORTS = {
  360: { width: 360, height: 780, mobile: true },
  390: { width: 390, height: 844, mobile: true },
  834: { width: 834, height: 1194, mobile: false },
  1440: { width: 1440, height: 900, mobile: false },
}

/** The viewports a scenario runs at: its own `widths`, or every viewport of the profile (the filtered /recipes and /pantry). */
export function scenarioViewports(scenario, profileViewports) {
  if (!scenario.widths) return profileViewports
  return scenario.widths.map((w) => {
    const vp = SCENARIO_VIEWPORTS[w]
    if (!vp) throw new Error(`scenario ${scenario.name}: no viewport for ${w} px in SCENARIO_VIEWPORTS`)
    return vp
  })
}

/**
 * hf-recipes-filter round 3 (docs/design/recipes-filter.md 14): the closed filtered /recipes is loaded fresh at each of these phone
 * widths, and the page must not break at any (P21: an uncaught exception, a console error, or the error page).
 */
export const RESIZE_WALK = { scenario: 'recipes-filtered', from: 360, to: 480, step: 10 }

/** pantry-filter: every walk the guard runs (fresh loads, then the live 1 px sweep): the filtered /recipes and the filtered /pantry. */
export const RESIZE_WALKS = [RESIZE_WALK, { ...RESIZE_WALK, scenario: 'pantry-filtered' }]

/**
 * The findings of one walked width: P21 from the runtime errors and the error page the walk saw there, and (pantry-filter review) P22
 * from the chip Selects whose value was cut there (`cutSelects`, the driver's cutSelectProbe). Only these two are read from a walk.
 */
export function resizeWalkFindings(runtimeErrors, { width, route }, cutSelects = []) {
  const walked = {
    vw: width, scrollW: width, clientW: width, over: [], content: { x: 0, r: width }, railR: 0, container: { x: 0, r: width },
    pageWidthAttr: 'wide', fields: [], bars: [], railContrast: null, dialog: null, brokenText: [], runtimeErrors, cutSelects,
  }
  return evaluateMetrics(walked, { width, route, kind: 'wide' }).filter((f) => f.rule === 'P21' || f.rule === 'P22')
}

/**
 * Review of round 3: the same scenario resized live in one page, 1 px at a time, from the walk's widest width down to its narrowest
 * and back up, with `pauseMs` after each step (P21 "(live resize)"). It catches a window narrower than the walk's step, and the
 * resize path that a fresh load never takes.
 */
export const RESIZE_SWEEP = { step: 1, pauseMs: 40 }

/** The widths of the RESIZE_SWEEP, in order: RESIZE_WALK.to down to RESIZE_WALK.from, then back up (every walk has the same range). */
export function resizeSweepWidths() {
  const down = []
  for (let w = RESIZE_WALK.to; w >= RESIZE_WALK.from; w -= RESIZE_SWEEP.step) down.push(w)
  return [...down, ...down.slice(0, -1).reverse()]
}

/** The widths of the RESIZE_WALK, in order. */
export function resizeWalkWidths() {
  const out = []
  for (let w = RESIZE_WALK.from; w <= RESIZE_WALK.to; w += RESIZE_WALK.step) out.push(w)
  return out
}

/** The URL of a scenario: its `start`, or /recipes with the Side Course and the long Tag, /pantry with Use soon and the long Storage Place (ids file). */
export function resolveScenario(scenario, ids) {
  // beta.7: a scenario with a `start` opens that route (":id" from the ids file) and its setup takes it from there.
  if (scenario.start) return resolveRoute(scenario.start, ids)
  const params =
    scenario.route === '/pantry'
      ? new URLSearchParams({ status: 'useSoon', place: String(ids.longPlaceId) })
      : new URLSearchParams({ course: String(ids.sideCourseId), tag: String(ids.longTag) })
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
  // The bar floats inside the gutters, so it lines up with the container's content box (containerInner) when the probe reports it.
  const edge = m.containerInner ?? m.container
  for (const b of m.bars) {
    if (b.bgAlpha === 0) add('P6', `sticky bar .${b.cls} has a transparent background`)
    if (Math.abs(b.x - edge.x) > 4 || Math.abs(b.r - edge.r) > 4) {
      add('P6', `sticky bar .${b.cls} (${b.x}-${b.r}) does not line up with the page content (${edge.x}-${edge.r})`)
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
  // hf-recipes-filter round 3 (P21, always fails): the page broke while it was walked through phone widths (RESIZE_WALK).
  for (const e of m.runtimeErrors ?? []) add('P21', `the page broke (${e.why}): ${e.text}; the chip line must settle at every width, not loop (docs/design/recipes-filter.md 14)`)
  // pantry-filter review (P22, always fails): a chip Select (a toolbar picker: Sort, Shop) cuts its value with an ellipsis. Such a chip
  // is sized by its value, so a cut value means its row has no room for it ("G…", then "Good u…", passed every other rule: P16 reads
  // only .chip labels).
  for (const c of m.cutSelects ?? []) add('P22', `${c.sel} "${c.label}" shows ${c.shown} px and cuts ${c.px} px of its value with an ellipsis; a chip Select shows its value in full: give its row room or take it from what sits beside it`)
  // b8-shop (P23, always fails): a Shop row's one-line info meta is cut by its ellipsis: a food Line's Meal Slot hint ("Tue Dinner +1")
  // or, since b8-polish, a Supply Line's Restock reason ("400/1000 ml" below 420 px).
  for (const c of m.cutMeta ?? []) add('P23', `${c.sel} "${c.label}" shows ${c.shown} px and cuts ${c.px} px of its hint with an ellipsis; the Shop's hint names the first Meal Slot and counts the rest, and a Restock reason is compact ("400/1000 ml") below 420 px, so each fits its row: give the row room (--row-value-min) or shorten the hint`)
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

const ID_KEYS = { recipes: 'recipeId', ingredients: 'ingredientId', products: 'productId', shops: 'shopId', supplies: 'supplyId' }
/** Replaces ":id" with the seeded id of the entity named by the preceding path segment. */
export function resolveRoute(pattern, ids) {
  const parts = pattern.split('/')
  return parts.map((s, i) => (s === ':id' ? String(ids[ID_KEYS[parts[i - 1]]] ?? 1) : s)).join('/')
}

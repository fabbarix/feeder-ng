// hf-recipes-filter round 2: the page-layout guard learns what the review of bb354d3c found in a browser
// (docs/design/recipes-filter.md 13.6): P17 a "+N" chip line that shows a cut chip after its first, or a chip past its end; P18 a
// focus ring or hit area cut by a clipping ancestor; P19 an open popover not end-aligned with its trigger or outside the page;
// P20 Recipes filter spacing. And SCENARIOS: the guard also probes a filtered /recipes, closed and with the Filters panel open.
// jsdom cannot lay out: the rules are tested on probe metrics here, and in a browser by
// scripts/test/page-layout-recipes-header_test.sh (fixtures/page-layout-recipes-header/round1.html and fixed.html).
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()

interface Scenario {
  name: string
  route: string
  open: boolean
}
const rules = createRequire(resolve(cwd, 'package.json'))(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as {
  ALWAYS_FAIL: string[]
  SCENARIOS?: Scenario[]
  resolveScenario?: (s: Scenario, ids: Record<string, unknown>) => string
  evaluateMetrics: (m: Record<string, unknown>, ctx: { width: number; route: string; kind: string }) => { rule: string; message: string }[]
}
const driver = readFileSync(resolve(cwd, '../scripts/check-page-layout.mjs'), 'utf8')
const seed = readFileSync(resolve(cwd, '../scripts/test/fixtures/page-layout-seed.mjs'), 'utf8')

const base = (vw: number) => ({
  vw, scrollW: vw, clientW: vw, over: [], content: { x: 24, r: vw - 24 }, railR: 0, container: { x: 24, r: vw - 24 },
  pageWidthAttr: 'wide', fields: [], bars: [], railContrast: null, dialog: null, brokenText: [],
})
const run = (extra: Record<string, unknown>, width = 390) =>
  rules.evaluateMetrics({ ...base(width), ...extra }, { width, route: '/recipes?course=2&tag=x', kind: 'wide' })
const rulesOf = (f: { rule: string }[]) => f.map((x) => x.rule)

describe('P17-P20 fail in every mode', () => {
  it.each(['P17', 'P18', 'P19', 'P20'])('%s is in ALWAYS_FAIL', (rule) => {
    expect(rules.ALWAYS_FAIL).toContain(rule)
  })
})

describe('P17: a "+N" chip line shows a cut chip after its first, or a chip past its end', () => {
  it('a cut chip is a finding naming the line, the label and the hidden px', () => {
    const f = run({ fitLines: [{ sel: 'div.filter-chips', label: 'extraordinarily long family favourite weeknight tag', why: 'cut', px: 182 }] })
    const p = f.find((x) => x.rule === 'P17')
    expect(p?.message).toMatch(/^P17 /)
    expect(p?.message).toMatch(/filter-chips/)
    expect(p?.message).toMatch(/extraordinarily long/)
    expect(p?.message).toMatch(/182\s*px/)
    expect(p?.message).toMatch(/\+N/)
  })
  it('a chip running past the line is a finding too', () => {
    expect(rulesOf(run({ fitLines: [{ sel: 'div.filter-chips', label: 'Side', why: 'spill', px: 40 }] }))).toContain('P17')
  })
  it('none (or no probe) is clean', () => {
    expect(rulesOf(run({ fitLines: [] }))).not.toContain('P17')
    expect(rulesOf(run({}))).not.toContain('P17')
  })
})

describe('P18: a focus ring or hit area cut by a clipping ancestor', () => {
  it('names the control, what is cut and by how much', () => {
    const f = run({ clippedRings: [{ sel: 'button.chip', label: 'Main', what: 'focus ring', px: 5 }, { sel: 'button.chip', label: 'Side', what: 'hit area', px: 9 }] })
    const p = f.filter((x) => x.rule === 'P18')
    expect(p).toHaveLength(2)
    expect(p[0]?.message).toMatch(/Main/)
    expect(p[0]?.message).toMatch(/focus ring/)
    expect(p[0]?.message).toMatch(/5\s*px/)
    expect(p[1]?.message).toMatch(/hit area/)
  })
  it('none is clean', () => {
    expect(rulesOf(run({ clippedRings: [] }))).not.toContain('P18')
  })
})

describe('P19: an open popover lines its end edge up with its trigger and stays in the page (from 768 px)', () => {
  const ok = { dx: 0, left: 410, right: 810, contentX: 24, contentR: 810 }
  it('aligned and inside: clean', () => {
    expect(rulesOf(run({ popoverAlign: ok }, 834))).not.toContain('P19')
    expect(rulesOf(run({ popoverAlign: { ...ok, dx: 1 } }, 834))).not.toContain('P19')
  })
  it('an end edge off the trigger\'s is a finding with the offset', () => {
    const p = run({ popoverAlign: { ...ok, dx: -296 } }, 834).find((x) => x.rule === 'P19')
    expect(p?.message).toMatch(/^P19 /)
    expect(p?.message).toMatch(/296\s*px/)
  })
  it('a popover past the page content box is a finding', () => {
    expect(rulesOf(run({ popoverAlign: { ...ok, right: 830 } }, 834))).toContain('P19')
    expect(rulesOf(run({ popoverAlign: { ...ok, left: 10 } }, 1440))).toContain('P19')
  })
  it('below 768 px (a bottom sheet) or with no popover open: nothing to check', () => {
    expect(rulesOf(run({ popoverAlign: { ...ok, dx: -296 } }, 390))).not.toContain('P19')
    expect(rulesOf(run({ popoverAlign: null }, 834))).not.toContain('P19')
  })
})

describe('P20: Recipes filter spacing', () => {
  it('row 3 one slot gap below row 2: clean', () => {
    expect(rulesOf(run({ filterSpacing: { rowGap: 16, slotGap: 16, sectionGap: null } }))).not.toContain('P20')
  })
  it('row 3 flush with row 2 is a finding naming both gaps', () => {
    const p = run({ filterSpacing: { rowGap: 0, slotGap: 16, sectionGap: null } }).find((x) => x.rule === 'P20')
    expect(p?.message).toMatch(/^P20 /)
    expect(p?.message).toMatch(/0\s*px/)
    expect(p?.message).toMatch(/16\s*px/)
  })
  it('two panel sections closer than 12 px is a finding', () => {
    expect(rulesOf(run({ filterSpacing: { rowGap: 16, slotGap: 16, sectionGap: 0 } }))).toContain('P20')
    expect(rulesOf(run({ filterSpacing: { rowGap: 16, slotGap: 16, sectionGap: 16 } }))).not.toContain('P20')
  })
  it('no row 3 or no probe: clean', () => {
    expect(rulesOf(run({ filterSpacing: null }))).not.toContain('P20')
    expect(rulesOf(run({}))).not.toContain('P20')
  })
})

describe('SCENARIOS: a filtered /recipes, closed and with the panel open', () => {
  // pantry-filter: SCENARIOS also holds the filtered /pantry (pageLayoutRules.pantryFilter.test.ts); the Recipes ones come first.
  it('has both, on /recipes', () => {
    expect(rules.SCENARIOS?.filter((s) => s.route === '/recipes').map((s) => [s.name, s.open])).toEqual([
      ['recipes-filtered', false],
      ['recipes-filtered-open', true],
    ])
    expect(rules.SCENARIOS?.slice(0, 2).map((s) => s.route)).toEqual(['/recipes', '/recipes'])
  })
  it('resolveScenario puts the Side Course and the long Tag from the ids file in the URL', () => {
    const ids = { sideCourseId: 2, longTag: 'extraordinarily long family favourite weeknight tag' }
    for (const s of (rules.SCENARIOS ?? []).filter((x) => x.route === '/recipes')) {
      const url = rules.resolveScenario?.(s, ids) ?? ''
      const q = new URLSearchParams(url.split('?')[1] ?? '')
      expect(url.startsWith('/recipes?')).toBe(true)
      expect(q.get('course')).toBe('2')
      expect(q.get('tag')).toBe(ids.longTag)
    }
  })
})

describe('the driver', () => {
  it('runs the SCENARIOS, opening the Filters panel for the open one', () => {
    expect(driver).toMatch(/SCENARIOS/)
    expect(driver).toMatch(/resolveScenario/)
    expect(driver).toMatch(/filter-bar__search-row/)
  })
  it('collects fitLines, clippedRings (focusing each chip with focusVisible), popoverAlign and filterSpacing', () => {
    for (const metric of ['fitLines', 'clippedRings', 'popoverAlign', 'filterSpacing']) expect(driver, metric).toMatch(new RegExp(`${metric}\\s*[,:=]`))
    expect(driver).toMatch(/focusVisible:\s*true/)
    expect(driver).toMatch(/overflow-clip-margin|overflowClipMargin/)
    expect(driver).toMatch(/::before/)
  })
})

describe('the seed', () => {
  it('tags a Side Recipe with a very long Tag and writes sideCourseId and longTag to the ids file', () => {
    expect(seed).toMatch(/const LONG_TAG = '[^']+'/)
    expect(seed).toMatch(/sideCourseId/)
    expect(seed).toMatch(/longTag/)
  })
  // Round 3 (review): the API refuses a Tag over 40 characters, so a longer LONG_TAG is never created and the filtered scenario shows
  // no Recipe. The seed exits 1 when the Recipe carrying it is missing.
  it('keeps LONG_TAG within the 40 characters a Tag may have, and fails when its Recipe is not created', () => {
    const tag = /const LONG_TAG = '([^']+)'/.exec(seed)?.[1] ?? ''
    expect([...tag].length).toBeGreaterThan(30)
    expect([...tag].length).toBeLessThanOrEqual(40)
    expect(seed).toMatch(/longTagRecipe === null[^\n]*\n[^\n]*\n\s*process\.exit\(1\)/)
  })
})

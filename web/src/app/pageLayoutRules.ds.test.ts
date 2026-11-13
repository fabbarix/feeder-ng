// DS-A (docs/design/system.md §8, §10; ADR 0016): the page-layout guard looks at tablets on every merge and learns P12.
//   - the quick profile (check.sh) includes the iPad portraits 834x1194 and 1024x1366, where beta.5 broke "Cauliflo/wer";
//   - the seed uses realistic long names and a "not marked Cooked yet" hint, so mid-word breaks and overflow surface;
//   - P12: at the end of a scroll, no content box of <main> is under the floating bottom bar.
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const rules = createRequire(resolve(cwd, 'package.json'))(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as {
  PROFILES: Record<'quick' | 'full', { width: number; height: number; mobile: boolean }[]>
  evaluateMetrics: (m: Record<string, unknown>, ctx: { width: number; route: string; kind: string }) => { rule: string; message: string }[]
}
const driver = readFileSync(resolve(cwd, '../scripts/check-page-layout.mjs'), 'utf8')
const seed = readFileSync(resolve(cwd, '../scripts/test/fixtures/page-layout-seed.mjs'), 'utf8')

const base = (vw: number) => ({
  vw, scrollW: vw, clientW: vw, over: [], content: { x: 24, r: vw - 24 }, railR: 0, container: { x: 24, r: vw - 24 },
  pageWidthAttr: 'wide', fields: [], bars: [], railContrast: null, dialog: null, brokenText: [],
})
const findings = (extra: Record<string, unknown>, width: number, route = '/shop') =>
  rules.evaluateMetrics({ ...base(width), ...extra }, { width, route, kind: 'wide' })

describe('quick profile: iPad portrait on every merge', () => {
  it.each([
    [834, 1194],
    [1024, 1366],
  ])('includes %ix%i (not mobile)', (width, height) => {
    expect(rules.PROFILES.quick).toContainEqual({ width, height, mobile: false })
  })
})

describe('P11 at tablet widths', () => {
  it.each([834, 1024])('"Cauliflo/wer" (a mid-word break in a Line name) is a P11 finding at %i px', (width) => {
    const f = findings({ brokenText: [{ sel: 'p.line-tile__title', why: 'mid-word', token: 'Cauliflower' }] }, width)
    expect(f.find((x) => x.rule === 'P11')?.message).toMatch(/line-tile__title.*mid-word/)
  })
  it('a hyphenated break ("cau-/liflower") is reported as mid-word too: the probe ignores the inserted hyphen', () => {
    // the driver compares the characters either side of a line break in the text node; hyphens: auto adds no character there
    expect(driver).toMatch(/isWordChar\(prevCh\) && isWordChar\(ch\)/)
  })
})

describe('P12: content under the bottom bar', () => {
  it('a content box under the bar at the end of the scroll is a P12 finding naming it and the overlap', () => {
    const f = findings({ navOverlap: [{ sel: 'li.list-row', px: 38 }] }, 834)
    const p12 = f.find((x) => x.rule === 'P12')
    expect(p12?.message).toMatch(/^P12 /)
    expect(p12?.message).toMatch(/li\.list-row/)
    expect(p12?.message).toMatch(/38\s*px/)
  })
  it('nothing under the bar, or no bar (rail from 1024 px: the probe reports null), is clean', () => {
    expect(findings({ navOverlap: [] }, 390).map((x) => x.rule)).not.toContain('P12')
    expect(findings({ navOverlap: null }, 1024).map((x) => x.rule)).not.toContain('P12')
  })
  it('the driver probes it with the shared probe file: scrolls to the end, measures main content against nav.bottom-bar', () => {
    // round 2: one probe (scripts/lib/page-layout-nav-probe.js, `feederNavProbe`), evaluated by the driver and exercised on
    // static pages by scripts/test/ds-layout_test.sh
    expect(driver).toMatch(/navOverlap/)
    expect(driver).toMatch(/page-layout-nav-probe\.js/)
    let probe = ''
    try {
      probe = readFileSync(resolve(cwd, '../scripts/lib/page-layout-nav-probe.js'), 'utf8')
    } catch {
      /* missing: the expectations below fail */
    }
    expect(probe).toMatch(/feederNavProbe/)
    expect(probe).toMatch(/nav\.bottom-bar/)
    expect(probe).toMatch(/scrollTo\([^)]*scrollHeight/)
  })
  it('round 2: a box intersecting the bar counts, also one entirely under it; only a box below the bar\'s bottom edge is skipped', () => {
    let probe = ''
    try {
      probe = readFileSync(resolve(cwd, '../scripts/lib/page-layout-nav-probe.js'), 'utf8')
    } catch {
      /* missing */
    }
    expect(probe).not.toMatch(/b\.top\s*>=\s*top\b/) // the beta.5.1 skip that hid a fully covered button
    expect(probe).toMatch(/\.bottom\b/) // compares against the bar's bottom edge
  })
})

describe('seed: realistic long names and hints', () => {
  it.each(['Two-colour cauliflower with peppers', 'Gorgonzola', 'Cucumber tomato feta salad', 'Cauliflower', 'Chestnut mushrooms'])(
    'seeds "%s"',
    (name) => expect(seed).toContain(name),
  )
  it('serves a Side Course on Dinner, so Plan and Today show Course rows', () => {
    expect(seed).toMatch(/\/api\/courses/)
    expect(seed).toMatch(/'Side'/)
  })
  it('leaves Planned Meals not marked Cooked yet, so To confirm and the Shop hint ("Includes … not marked Cooked yet") render', () => {
    expect(seed).toMatch(/to-confirm/)
    expect(seed).toMatch(/toConfirm/) // the count is written to the ids file and printed
  })
})

// DS-A round 2 (the Plan review): Course rows 582 px wide in a 358 px day tile, the page 614 px wide on a 390 phone, and the
// guard said OK. Causes: the guard ran an older seed with no chip line (the row never got long), P1's "past the right edge"
// half compared against innerWidth, which phone emulation widens with the content (614), and content wider than its tile had no
// rule at all. Horizontal overflow now fails in every mode. Behavioural check: scripts/test/page-layout-overflow_test.sh.
describe('P13 and the always-fail rules (round 2)', () => {
  const r2 = rules as unknown as {
    ALWAYS_FAIL?: string[]
    evaluateMetrics: (m: Record<string, unknown>, ctx: { width: number; route: string; kind: string }) => { rule: string; message: string }[]
  }
  it('a box wider than its tile is a P13 finding naming the box, the tile and the overflow', () => {
    const f = findings({ tileOverflow: [{ sel: 'span.plan-course__chips', card: 'section.tile', px: 224 }] }, 1024, '/plan')
    const p13 = f.find((x) => x.rule === 'P13')
    expect(p13?.message).toMatch(/^P13 /)
    expect(p13?.message).toMatch(/plan-course__chips/)
    expect(p13?.message).toMatch(/section\.tile/)
    expect(p13?.message).toMatch(/224\s*px/)
  })
  it('no tile overflow is clean', () => {
    expect(findings({ tileOverflow: [] }, 1024).map((x) => x.rule)).not.toContain('P13')
  })
  it('P1 and P13 fail in every mode (ALWAYS_FAIL)', () => {
    expect(r2.ALWAYS_FAIL).toEqual(expect.arrayContaining(['P1', 'P13']))
  })
  it('the driver measures the right edge against documentElement.clientWidth (phone emulation widens innerWidth)', () => {
    expect(driver).toMatch(/b\.right > (cw|clientW|document\.documentElement\.clientWidth)/)
    expect(driver).toMatch(/tileOverflow/)
  })
})

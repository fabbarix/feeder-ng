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
  it('the driver probes it: scrolls to the end, measures main content against nav.bottom-bar, returns navOverlap', () => {
    expect(driver).toMatch(/navOverlap/)
    expect(driver).toMatch(/nav\.bottom-bar|\.bottom-bar/)
    expect(driver).toMatch(/scrollTo\([^)]*scrollHeight/)
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

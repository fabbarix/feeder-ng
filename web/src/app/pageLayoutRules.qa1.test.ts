// QA-1 (1.0.0-beta.4.1): the page-layout guard learns the two defects the beta.4 visual QA found by eye.
//   P10 a Button label under 4.5:1 on its own background ("Choose a Recipe" on the Today hero, 1.5:1 light, 1.3:1 dark);
//   P11 text clipped by its box, or a word broken mid-word (the Board clock: "13:06" at the tile edge, "Novembe" / "r").
// The driver's probe (scripts/check-page-layout.mjs) fills `lowContrastButtons` and `brokenText`; these are the pure rules.
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const rules = createRequire(resolve(cwd, 'package.json'))(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as {
  evaluateMetrics: (m: Record<string, unknown>, ctx: { width: number; route: string; kind: string }) => { rule: string; message: string }[]
}
const base = {
  vw: 820, scrollW: 820, clientW: 820, over: [], content: { x: 24, r: 796 }, railR: 0, container: { x: 24, r: 796 },
  pageWidthAttr: 'full', fields: [], bars: [], railContrast: 7, dialog: null,
}
const run = (extra: Record<string, unknown>) => rules.evaluateMetrics({ ...base, ...extra }, { width: 820, route: '/board', kind: 'full' }).map((f) => f.rule)

describe('P10: Button label contrast', () => {
  it('a Button label under 4.5:1 is a finding that names the Button', () => {
    const f = rules.evaluateMetrics({ ...base, lowContrastButtons: [{ label: 'Choose a Recipe', ratio: 1.5 }] }, { width: 820, route: '/', kind: 'full' })
    expect(f.map((x) => x.rule)).toContain('P10')
    expect(f.find((x) => x.rule === 'P10')!.message).toMatch(/Choose a Recipe.*1\.5/)
  })
  it('no low-contrast Buttons is clean', () => expect(run({ lowContrastButtons: [] })).not.toContain('P10'))
})

describe('P11: clipped text and mid-word breaks', () => {
  it('text wider than its box (clipped) is a finding', () => {
    expect(run({ brokenText: [{ sel: 'p.board-clock__time', why: 'clipped' }] })).toContain('P11')
  })
  it('a word broken across lines is a finding', () => {
    const f = rules.evaluateMetrics({ ...base, brokenText: [{ sel: 'p.board-clock__date', why: 'mid-word' }] }, { width: 820, route: '/board', kind: 'full' })
    expect(f.find((x) => x.rule === 'P11')!.message).toMatch(/board-clock__date.*mid-word/)
  })
  it('nothing broken is clean', () => expect(run({ brokenText: [] })).not.toContain('P11'))
})

describe('the driver probes them', () => {
  it('check-page-layout.mjs reports lowContrastButtons and brokenText', () => {
    const src = readFileSync(resolve(cwd, '../scripts/check-page-layout.mjs'), 'utf8')
    expect(src).toContain('lowContrastButtons')
    expect(src).toContain('brokenText')
  })
})

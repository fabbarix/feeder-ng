// DS-TODAY round 2: the page-layout guard learns P15, the review's finding on Today: a row's actions collapsed to 0 px, buttons
// narrower than their label, text under the actions. The probe reports `actionLayout` [{ sel, why, px }]; it fails in every mode.
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const rules = createRequire(resolve(cwd, 'package.json'))(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as {
  ALWAYS_FAIL: string[]
  evaluateMetrics: (m: Record<string, unknown>, ctx: { width: number; route: string; kind: string }) => { rule: string; message: string }[]
}
const driver = readFileSync(resolve(cwd, '../scripts/check-page-layout.mjs'), 'utf8')
const base = (vw: number) => ({
  vw, scrollW: vw, clientW: vw, over: [], content: { x: 24, r: vw - 24 }, railR: 0, container: { x: 24, r: vw - 24 },
  pageWidthAttr: 'wide', fields: [], bars: [], railContrast: null, dialog: null, brokenText: [],
})
const run = (actionLayout: unknown, width = 1024) => rules.evaluateMetrics({ ...base(width), actionLayout }, { width, route: '/', kind: 'wide' })

describe('P15: actions that do not fit their row', () => {
  it('a button narrower than its label is a P15 finding naming it and the clipped pixels', () => {
    const p = run([{ sel: 'button.button', why: 'label-clipped', px: 12 }]).find((x) => x.rule === 'P15')
    expect(p?.message).toMatch(/^P15 /)
    expect(p?.message).toMatch(/button\.button/)
    expect(p?.message).toMatch(/12\s*px/)
  })

  it('an action group of 0 px, or text under the actions, is a P15 finding too', () => {
    expect(run([{ sel: 'div.action-group', why: 'collapsed', px: 0 }]).map((x) => x.rule)).toContain('P15')
    expect(run([{ sel: 'p.to-confirm__title', why: 'overlaps-actions', px: 30 }]).map((x) => x.rule)).toContain('P15')
  })

  it('nothing reported is clean; an older probe without the field is clean', () => {
    expect(run([]).map((x) => x.rule)).not.toContain('P15')
    expect(run(undefined).map((x) => x.rule)).not.toContain('P15')
  })

  it('it fails in every mode (ALWAYS_FAIL), also on warn routes', () => {
    expect(rules.ALWAYS_FAIL).toContain('P15')
  })

  it('the driver measures it in the page: button scrollWidth > clientWidth, a group under 1 px, a text box intersecting its row\'s group', () => {
    expect(driver).toMatch(/actionLayout/)
    expect(driver).toMatch(/scrollWidth\s*>\s*[a-z.]*clientWidth/)
    expect(driver).toMatch(/\.action-group/)
  })
})

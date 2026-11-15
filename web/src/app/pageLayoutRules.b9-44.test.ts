// B9-44 (RES-05; plan section 9): page-layout rule P42 (by mode) and its probe `today-subtitle`.
//   scripts/lib/page-layout/rules/P42-today-subtitle.mjs   todaySubtitle { texts, expected, device } | null   probes/today-subtitle.mjs
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const req = createRequire(resolve(cwd, 'package.json'))
const api = req(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as {
  RULES: { id: string; always: boolean; title: string }[]
  ALWAYS_FAIL: string[]
  RESERVED: { id: string }[]
  PROBES: { name: string; key: string | null; source: string }[]
  evaluateMetrics: (m: unknown, c: Ctx) => Finding[]
}
interface Ctx { width: number; route: string; kind: string }
interface Finding { rule: string; message: string }

const base = (vw: number) => ({ vw, scrollW: vw, clientW: vw, over: [], content: { x: 24, r: vw - 24 }, railR: 0, container: { x: 24, r: vw - 24 }, pageWidthAttr: 'default', fields: [], bars: [], railContrast: null, dialog: null, brokenText: [] })
const run = (todaySubtitle: unknown, route = '/') => api.evaluateMetrics({ ...base(390), todaySubtitle }, { width: 390, route, kind: 'default' }).filter((f) => f.rule === 'P42')

describe('registration', () => {
  it('P42 is active, always fail since B9-55, and no longer reserved', () => {
    expect(api.RULES.find((r) => r.id === 'P42')?.always).toBe(true)
    expect(api.ALWAYS_FAIL).toContain('P42')
    expect(api.RESERVED.map((r) => r.id)).not.toContain('P42')
  })
  it('the probe fills todaySubtitle and is an in-page IIFE that reads only main and /api/me', () => {
    const p = api.PROBES.find((x) => x.name === 'today-subtitle')
    expect(p?.key).toBe('todaySubtitle')
    expect(p!.source.trim().startsWith('(')).toBe(true)
    expect(p!.source).toContain('.page-header__subtitle')
    expect(p!.source).toContain('/api/me')
  })
})

describe('P42', () => {
  const ok = { texts: ['Mon 9 Nov'], expected: 'Mon 9 Nov', device: 'Sun 8 Nov' }
  it('passes the Household date', () => {
    expect(run(ok)).toEqual([])
  })
  it('names the device date when it is shown instead of the Household date', () => {
    const out = run({ texts: ['Sun 8 Nov'], expected: 'Mon 9 Nov', device: 'Sun 8 Nov' })
    expect(out).toHaveLength(1)
    expect(out[0]!.message).toMatch(/Sun 8 Nov.*Mon 9 Nov.*device/)
  })
  it('flags any other subtitle text', () => {
    expect(run({ texts: ['3 to confirm'], expected: 'Mon 9 Nov', device: 'Sun 8 Nov' })).toHaveLength(1)
  })
  it('flags a second subtitle', () => {
    expect(run({ texts: ['Mon 9 Nov', 'Mon 9 Nov'], expected: 'Mon 9 Nov', device: 'x' }).length).toBeGreaterThan(0)
  })
  it('a skeleton (an empty subtitle) is not a finding: the date is reserved, not wrong', () => {
    expect(run({ texts: [''], expected: 'Mon 9 Nov', device: 'x' })).toEqual([])
  })
  it('with no zone known it asks only that the subtitle looks like a date', () => {
    expect(run({ texts: ['Mon 9 Nov'], expected: null, device: 'x' })).toEqual([])
    expect(run({ texts: ['hello'], expected: null, device: 'x' })).toHaveLength(1)
  })
  it('does nothing off Today, or without the metric', () => {
    expect(run({ texts: ['hello'], expected: 'Mon 9 Nov', device: 'x' }, '/plan')).toEqual([])
    expect(run(null)).toEqual([])
    expect(run(undefined)).toEqual([])
  })
})

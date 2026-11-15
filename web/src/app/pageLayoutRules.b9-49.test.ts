// B9-49 (A11Y-01; plan section 9): page-layout rule P37 (always), its probe, and the shell scenarios. The files:
//   scripts/lib/page-layout/rules/P37-page-title.mjs   P37: document.title is "Feeder", or does not match the h1 / the route's stable title
//   scripts/lib/page-layout/probes/page-title.mjs      key pageTitle
//   scripts/lib/page-layout/scenarios/b9-49.mjs        order 350: shell-skip-link, shell-offline-banner, nav-current-*, boot-theme
// Metrics shape:  pageTitle: { title: string, h1: string | null } | null
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const nodeVm = 'node:vm'
const { Script } = (await import(/* @vite-ignore */ nodeVm)) as { Script: new (src: string) => unknown }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const req = createRequire(resolve(cwd, 'package.json'))
const api = req(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as {
  RULES: { id: string; always: boolean; title: string }[]
  ALWAYS_FAIL: string[]
  PROBES: { name: string; key: string | null; source: string; scenarios?: string[] }[]
  SCENARIOS: { name: string; route: string; start?: string; widths?: (number | string)[]; rules?: string[]; setup?: string }[]
  SETUPS: Record<string, unknown>
  evaluateMetrics: (m: unknown, c: Ctx) => Finding[]
}
interface Ctx { width: number; route: string; kind: string }
interface Finding { rule: string; message: string }

const base = (vw: number) => ({ vw, scrollW: vw, clientW: vw, over: [], content: { x: 24, r: vw - 24 }, railR: 0, container: { x: 24, r: vw - 24 }, pageWidthAttr: 'default', fields: [], bars: [], railContrast: null, dialog: null, brokenText: [] })
const p37 = (title: string, h1: string | null, route = '/plan', width = 390) =>
  api.evaluateMetrics({ ...base(width), pageTitle: { title, h1 } }, { width, route, kind: 'default' }).filter((f) => f.rule === 'P37')

describe('P37: the document title names the page (A11Y-01)', () => {
  it('is active and always fails (plan section 9)', () => {
    expect(api.RULES.map((r) => r.id)).toContain('P37')
    expect(api.ALWAYS_FAIL).toContain('P37')
    expect(api.RULES.find((r) => r.id === 'P37')!.title).toMatch(/document\.title/)
  })

  it('passes a title that starts with the h1 and ends with " · Feeder" (parents between them)', () => {
    expect(p37('Plan · Feeder', 'Plan')).toEqual([])
    expect(p37('Pasta al pomodoro · Recipes · Feeder', 'Pasta al pomodoro', '/recipes/:id')).toEqual([])
    expect(p37('Members · Settings · Feeder', 'Members', '/settings/members')).toEqual([])
    expect(p37('Review Exclusions · Plan · Feeder', 'Review Exclusions', '/plan/couldnt-plan/excluded')).toEqual([])
  })

  it('fails the bare "Feeder" (the beta.8 title of 35 of 35 routes), with the plan message', () => {
    const f = p37('Feeder', 'Plan')
    expect(f).toHaveLength(1)
    expect(f[0]!.message).toMatch(/^P37 document\.title is "Feeder"/)
  })

  it('fails a title that does not end with " · Feeder"', () => {
    expect(p37('Plan', 'Plan')).toHaveLength(1)
    expect(p37('Plan · Somewhere', 'Plan')).toHaveLength(1)
  })

  it('fails a title that does not start with the h1 (the page of the title is not the page shown)', () => {
    const f = p37('Shop · Feeder', 'Pantry', '/pantry')
    expect(f).toHaveLength(1)
    expect(f[0]!.message).toMatch(/does not start with the h1 "Pantry"/)
  })

  it('a page with no h1 yet (loading, failed) passes with a section title, and still fails the bare "Feeder"', () => {
    expect(p37('Plan · Feeder', null)).toEqual([])
    expect(p37('Feeder', null)).toHaveLength(1)
  })

  it('the sign-in pages are "Sign in to Feeder"', () => {
    expect(p37('Sign in to Feeder', null, '/sign-in')).toEqual([])
    expect(p37('Sign in to Feeder', 'Sign in to Feeder', '/sign-in')).toEqual([])
  })

  it('/scan, /scan/receipt and /scan/receipt/review have a stable title although their h1 is a question changing with the step', () => {
    expect(p37('Scan · Feeder', 'Which Shop are you in?', '/scan')).toEqual([])
    expect(p37('Receipt · Feeder', 'Add photos of the receipt', '/scan/receipt')).toEqual([])
    expect(p37('Receipt review · Feeder', 'Check the receipt', '/scan/receipt/review')).toEqual([])
    expect(p37('Which Shop are you in? · Feeder', 'Which Shop are you in?', '/scan')).toHaveLength(1)
  })

  it('Cook Mode is "Cook Mode · <Recipe> · Feeder"', () => {
    expect(p37('Cook Mode · Pasta al pomodoro · Feeder', 'Pasta al pomodoro', '/cook/recipe/:id')).toEqual([])
    expect(p37('Pasta al pomodoro · Feeder', 'Pasta al pomodoro', '/cook/recipe/:id')).toHaveLength(1)
  })

  it('the Kitchen board is "Kitchen board · Feeder" (its h1 is visually hidden but there)', () => {
    expect(p37('Kitchen board · Feeder', 'Kitchen board', '/board')).toEqual([])
  })

  it('no metrics (the resize walk, an older probe): no findings', () => {
    expect(api.evaluateMetrics(base(390), { width: 390, route: '/plan', kind: 'default' }).filter((f) => f.rule === 'P37')).toEqual([])
    expect(api.evaluateMetrics({ ...base(390), pageTitle: null }, { width: 390, route: '/plan', kind: 'default' }).filter((f) => f.rule === 'P37')).toEqual([])
  })
})

describe('the page-title probe', () => {
  const probe = () => api.PROBES.find((p) => p.name === 'page-title')!
  it('fills pageTitle and is page code that parses', () => {
    expect(probe().key).toBe('pageTitle')
    expect(() => new Script(probe().source)).not.toThrow()
  })
  it('reads document.title and the first visible h1', () => {
    expect(probe().source).toMatch(/document\.title/)
    expect(probe().source).toMatch(/h1/)
    expect(probe().scenarios).toBeUndefined() // on every page
  })
})

describe('the B9-49 scenarios', () => {
  const by = (name: string) => api.SCENARIOS.find((s) => s.name === name)
  it.each([
    ['shell-skip-link', '/shop', [1440, 390]],
    ['shell-offline-banner', '/plan', [390, 1440]],
    ['nav-current-recipe', '/recipes/:id', [390, 1440]],
    ['nav-current-recipe-edit', '/recipes/:id/edit', [390, 1440]],
    ['nav-current-ingredient', '/ingredients/:id', [390, 1440]],
    ['boot-theme', '/', [390]],
  ])('%s: route %s at %j, with a setup that measures and throws', (name, route, widths) => {
    const s = by(name)!
    expect(s, name).toBeDefined()
    expect(s.route).toBe(route)
    expect(s.start).toBe(route)
    expect(s.widths).toEqual(widths)
    expect(typeof api.SETUPS[s.setup!], `${name}'s setup`).toBe('function')
  })

  it('no width below 375 (amendment A1)', () => {
    for (const name of ['shell-skip-link', 'shell-offline-banner', 'nav-current-recipe', 'nav-current-recipe-edit', 'nav-current-ingredient', 'boot-theme']) {
      for (const w of by(name)!.widths ?? []) expect(Number(w), name).toBeGreaterThanOrEqual(375)
    }
  })

  it('the setup source says what it throws on (the findings of the chapter): skip link first and in view, banner stays in view, one current item', () => {
    const fs = req('node:fs') as { readFileSync: (p: string, e: string) => string }
    const src = fs.readFileSync(resolve(cwd, '../scripts/lib/page-layout/scenarios/b9-49.mjs'), 'utf8')
    expect(src).toMatch(/the first focusable element is/)
    expect(src).toMatch(/not inside the viewport/)
    expect(src).toMatch(/between 0 and 16/)
    expect(src).toMatch(/exactly 1/)
    expect(src).toMatch(/inside the rail/)
  })
})

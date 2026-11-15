// B9-27 (RX-04, RX-05, RX-07, SHORT-04): the page-layout files this package adds. Pure modules, no browser.
//  - scenarios recipe-detail-cook and recipe-detail-phone (scripts/lib/page-layout/scenarios/recipe-detail.mjs, order 340). Plan section 9 gives this
//    package no rule number, so the scenarios measure in their setups and throw; they report only the layout rules that can catch their breakage.
//  - the seed step page-layout-seed/recipe-detail.mjs (order 110).
//  - the scenario viewports 1024x768, 1280x800 and 1920x1080 in SCENARIO_VIEWPORTS (scripts/lib/page-layout-rules.mjs).
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const req = createRequire(resolve(cwd, 'package.json'))
const scripts = (...p: string[]) => resolve(cwd, '../scripts', ...p)

interface Scenario { name: string; route: string; start?: string; setup?: string; widths?: (number | string)[]; rules?: string[] }
const registry = req(scripts('lib/page-layout/registry.mjs')) as { SCENARIOS: Scenario[]; SETUPS: Record<string, unknown> }
const rules = req(scripts('lib/page-layout-rules.mjs')) as { SCENARIO_VIEWPORTS: Record<string, { width: number; height: number; mobile: boolean }> }
const find = (name: string) => registry.SCENARIOS.find((s) => s.name === name)

describe('scenario recipe-detail-cook (RX-04)', () => {
  const s = find('recipe-detail-cook')
  it('is registered: Recipe detail at 1024x768, 1280x800, 1440x900 and 1920x1080, with its setup', () => {
    expect(s).toBeDefined()
    expect(s!.route).toBe('/recipes/:id')
    expect(s!.start).toBe('/recipes/:id')
    expect(s!.widths).toEqual(['1024x768', '1280x800', 1440, '1920x1080'])
    expect(typeof registry.SETUPS[s!.setup!]).toBe('function')
  })
  it('the viewports exist and are the sizes of the chapter (the first viewport is 768, 800, 900 and 1080 tall)', () => {
    expect(rules.SCENARIO_VIEWPORTS['1024x768']).toMatchObject({ width: 1024, height: 768 })
    expect(rules.SCENARIO_VIEWPORTS['1280x800']).toMatchObject({ width: 1280, height: 800 })
    expect(rules.SCENARIO_VIEWPORTS['1920x1080']).toMatchObject({ width: 1920, height: 1080 })
    expect(rules.SCENARIO_VIEWPORTS[1440]).toMatchObject({ width: 1440, height: 900 })
  })
  it('reports only layout rules (the measures are in the setup), never fewer than P1 and P13', () => {
    expect(s!.rules).toEqual(expect.arrayContaining(['P1', 'P13']))
  })
})

describe('scenario recipe-detail-phone (SHORT-04, RX-04)', () => {
  const s = find('recipe-detail-phone')
  it('is registered at 375 and 390, never narrower (A1)', () => {
    expect(s).toBeDefined()
    expect(s!.route).toBe('/recipes/:id')
    expect(s!.widths).toEqual([375, 390])
    for (const w of s!.widths ?? []) expect(Number(w)).toBeGreaterThanOrEqual(375)
    expect(typeof registry.SETUPS[s!.setup!]).toBe('function')
  })
  it('includes the chip line rule P17 and the cut-chip rule P14', () => {
    expect(s!.rules).toEqual(expect.arrayContaining(['P14', 'P17']))
  })
})

describe('what the setups measure (read from the module, since they run in Chrome)', () => {
  const src = readFileSync(scripts('lib/page-layout/scenarios/recipe-detail.mjs'), 'utf8')
  it('the cook scenario: the primary action in the first viewport or in a sticky bar; the side column edges; nothing sticky; no chip in the metric strip', () => {
    for (const needle of ['Start Cook Mode', 'sticky-action-bar', 'recipe-detail__aside', "position === 'sticky'", 'data-min="metric"] .chip']) expect(src, needle).toContain(needle)
  })
  it('the phone scenario: metric values do not wrap, the bar is one row of at most 70 px, "Cook" at 375, the chip line cuts no chip', () => {
    for (const needle of ['tile-metric__value', 'barH > 71', 'sameRow', "'Cook'", 'recipe-tags[data-fitted="true"]']) expect(src, needle).toContain(needle)
  })
})

describe('the seed step that gives the seeded Recipe its lede, Source, Tags and an untimed Step', () => {
  it('is a drop-in area module after recipe-editor (order 110) that PUTs the first Recipe and keeps its long Tag', async () => {
    const mod = req(scripts('test/fixtures/page-layout-seed/recipe-detail.mjs')) as { order: number; seed: (ctx: unknown) => Promise<void> }
    const editor = req(scripts('test/fixtures/page-layout-seed/recipe-editor.mjs')) as { order: number }
    expect(mod.order).toBeGreaterThan(editor.order)
    const calls: { method: string; path: string; body: Record<string, unknown> & { tags: string[]; steps: { durationMinutes: number }[]; source: { url: string; attribution: string }; description: string } }[] = []
    const ctx = {
      step: async (_what: string, method: string, path: string, body: never) => (calls.push({ method, path, body }), { ok: true, json: {} }),
      line: (i: number, q: number) => ({ ingredientId: i + 1, quantity: q }),
      recipeId: 7,
      LONG_TAG: 'HEARTY HOMEMADE MUSHROOM WELLINGTONS',
    }
    await mod.seed(ctx)
    const put = calls.find((c) => c.method === 'PUT' && c.path === '/api/recipes/7')
    expect(put, 'PUT /api/recipes/7').toBeDefined()
    expect(put!.body.tags).toContain('HEARTY HOMEMADE MUSHROOM WELLINGTONS')
    expect(put!.body.tags.length).toBeGreaterThanOrEqual(8) // enough for a "+N"
    expect(put!.body.description.length).toBeGreaterThan(200) // clamps to 3 lines on a phone
    expect(put!.body.source.url).toMatch(/^https:\/\//)
    expect(put!.body.source.attribution.length).toBeGreaterThan(20)
    expect(put!.body.steps.some((s) => s.durationMinutes === 0)).toBe(true) // a "No time" row
    expect(put!.body.steps.some((s) => s.durationMinutes > 0)).toBe(true) // and a timed total
  })
})

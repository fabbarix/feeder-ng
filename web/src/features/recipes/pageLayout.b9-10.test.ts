// B9-10 (DS-04, DS-07): the page-layout files this package adds. (The large-text scenario font-24-settings-shops-id is B9-09's to re-enable.) Pure modules, no browser.
//  - scenario recipe-editor-long-tag (scripts/lib/page-layout/scenarios/recipe-editor.mjs): the editor of the Recipe that carries the
//    36-character Tag, at 375 and 390 (A1: 375 replaces 320). Before the .tag-input fix P13 finds the chip, its control and its label
//    15 px past the tile at 375.
//  - the seed step (page-layout-seed/recipe-editor.mjs) that gives the seeded Recipe that Tag.
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const req = createRequire(resolve(cwd, 'package.json'))
const scripts = (...p: string[]) => resolve(cwd, '../scripts', ...p)

interface Scenario { name: string; route: string; start?: string; setup?: string; widths?: (number | string)[]; rules?: string[] }
const registry = req(scripts('lib/page-layout/registry.mjs')) as { SCENARIOS: Scenario[]; SETUPS: Record<string, unknown> }

describe('scenario recipe-editor-long-tag (DS-04)', () => {
  const s = registry.SCENARIOS.find((x) => x.name === 'recipe-editor-long-tag')
  it('is registered: the editor, at 375 and 390, with its setup', () => {
    expect(s).toBeDefined()
    expect(s!.route).toBe('/recipes/:id/edit')
    expect(s!.start).toBe('/recipes/:id/edit')
    expect(s!.widths).toEqual([375, 390])
    expect(typeof registry.SETUPS[s!.setup!]).toBe('function')
  })
  it('reports every rule (it is not limited to P1: P13 finds the chip past its tile)', () => {
    expect(s!.rules).toBeUndefined()
  })
  it('never goes below 375 px (A1)', () => {
    for (const w of s!.widths ?? []) expect(Number(w)).toBeGreaterThanOrEqual(375)
  })
})

describe('the seed step that gives the seeded Recipe the long Tag', () => {
  it('is a drop-in area module (order from 100, seed(ctx)) and PUTs the first Recipe with LONG_TAG among its Tags', async () => {
    const mod = req(scripts('test/fixtures/page-layout-seed/recipe-editor.mjs')) as { order: number; seed: (ctx: unknown) => Promise<void> }
    expect(mod.order).toBeGreaterThanOrEqual(100)
    const calls: { method: string; path: string; body: { tags: string[]; name: string } }[] = []
    const ctx = {
      step: async (_what: string, method: string, path: string, body: { tags: string[]; name: string }) => (calls.push({ method, path, body }), { ok: true, json: {} }),
      line: (i: number, q: number) => ({ ingredientId: i + 1, quantity: q }),
      recipeId: 7,
      LONG_TAG: 'HEARTY HOMEMADE MUSHROOM WELLINGTONS',
    }
    await mod.seed(ctx)
    const put = calls.find((c) => c.method === 'PUT' && c.path === '/api/recipes/7')
    expect(put, 'PUT /api/recipes/7').toBeDefined()
    expect(put!.body.tags).toContain('HEARTY HOMEMADE MUSHROOM WELLINGTONS')
    expect(put!.body.tags.length).toBeGreaterThan(1)
    expect(ctx.LONG_TAG.length).toBeLessThanOrEqual(40)
  })
})

// DS-SHOP (docs/design/system.md §3, §8): the Shop part of the page-layout guard. /shop is probed at 834 and 1024 px (the quick
// profile, DS-A) with long Line names and a Line that includes Planned Meals not marked Cooked yet. After the redesign no Line name
// breaks mid-word (P11) and no row sits under the floating bottom bar at the end of the scroll (P12).
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const rules = createRequire(resolve(cwd, 'package.json'))(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as {
  ROUTES: [string, string][]
  PROFILES: Record<'quick' | 'full', { width: number; height: number; mobile: boolean }[]>
  evaluateMetrics: (m: Record<string, unknown>, ctx: { width: number; route: string; kind: string }) => { rule: string; message: string }[]
}
const seed = readFileSync(resolve(cwd, '../scripts/test/fixtures/page-layout-seed.mjs'), 'utf8')

const base = (vw: number) => ({
  vw, scrollW: vw, clientW: vw, over: [], content: { x: 24, r: vw - 24 }, railR: 0, container: { x: 24, r: vw - 24 },
  pageWidthAttr: 'wide', fields: [], bars: [], railContrast: null, dialog: null, brokenText: [],
})
const shop = (extra: Record<string, unknown>, width: number) => rules.evaluateMetrics({ ...base(width), ...extra }, { width, route: '/shop', kind: 'wide' })

describe('/shop in the page-layout guard', () => {
  it('is a wide route, probed in the quick profile at 390, 834 and 1024', () => {
    expect(rules.ROUTES).toContainEqual(['/shop', 'wide'])
    for (const w of [390, 834, 1024]) expect(rules.PROFILES.quick.map((p) => p.width)).toContain(w)
  })

  it.each([834, 1024])('a Line name broken mid-word in a row title ("Cauliflo/wer") is a P11 finding at %i px', (width) => {
    const f = shop({ brokenText: [{ sel: 'span.list-row__title', why: 'mid-word', token: 'Cauliflower' }] }, width)
    expect(f.find((x) => x.rule === 'P11')?.message).toMatch(/list-row__title.*mid-word/)
  })

  it.each([834, 1024])('a clipped metric or notice box is a P11 finding at %i px', (width) => {
    const f = shop({ brokenText: [{ sel: 'p.shop-metrics__label', why: 'clipped' }] }, width)
    expect(f.map((x) => x.rule)).toContain('P11')
  })

  it('a clean Shop (row titles wrapped at words, ellipsis on the clamp) has no P11 finding at 834 and 1024', () => {
    for (const w of [834, 1024]) expect(shop({ brokenText: [] }, w).map((x) => x.rule)).not.toContain('P11')
  })

  it('the last row under the bottom bar at 834 px is a P12 finding; at 1024 px (side rail, no bar) the probe reports null and is clean', () => {
    const p12 = shop({ navOverlap: [{ sel: 'li.list-row', px: 38 }] }, 834).find((x) => x.rule === 'P12')
    expect(p12?.message).toMatch(/li\.list-row.*38\s*px/)
    expect(shop({ navOverlap: null }, 1024).map((x) => x.rule)).not.toContain('P12')
    expect(shop({ navOverlap: [] }, 834).map((x) => x.rule)).not.toContain('P12')
  })

  it('the seed gives the Shop something to wrap: a Line named "Chestnut mushrooms", Planned Meals not marked Cooked yet and a long free-text extra', () => {
    expect(seed).toContain('Chestnut mushrooms')
    expect(seed).toMatch(/to-confirm/)
    expect(seed).toMatch(/\/api\/shopping\/extras',\s*\{\s*text:\s*'[^']{50,}'/)
  })
})

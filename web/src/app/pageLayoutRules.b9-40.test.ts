// B9-40 (SHORT-01; plan section 9): page-layout rule P34 (always fails), its probe and its scenarios. The files:
//   scripts/lib/page-layout/rules/P34-cook-step-visible.mjs   P34: the Cook Step text is not visible outside the Back/Next tiles at load  <- the DEVELOPER writes this one
//   scripts/lib/page-layout/probes/cook-step.mjs              key cookStep (written by the test author)
//   scripts/lib/page-layout/scenarios/b9-40.mjs               order 350: cook-step-landscape, cook-step-portrait, cook-step-photo (written by the test author)
// Metrics: cookStep: null | { innerWidth, innerHeight, text: Box | null, tiles: Box[] }   Box = { x, y, r, b }; `text` is the FIRST LINE of
// .cook-step__text. The rule: at least 80 % of that line's area is inside the viewport and outside every tile. One finding per page; no
// metrics, or no text box, means nothing to judge (the page is not Cook Mode).
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
  PROBES: { name: string; key: string | null; source: string; scenarios?: string[] }[]
  SCENARIOS: { name: string; route: string; start?: string; widths?: (number | string)[]; rules?: string[]; setup?: string }[]
  SCENARIO_VIEWPORTS: Record<string, { width: number; height: number; mobile: boolean }>
  evaluateMetrics: (m: unknown, c: Ctx) => Finding[]
}
interface Ctx { width: number; route: string; kind: string }
interface Finding { rule: string; message: string }

const base = (vw: number) => ({ vw, scrollW: vw, clientW: vw, over: [], content: { x: 24, r: vw - 24 }, railR: 0, container: { x: 24, r: vw - 24 }, pageWidthAttr: 'default', fields: [], bars: [], railContrast: null, dialog: null, brokenText: [] })
const run = (cookStep: unknown, width = 844) => api.evaluateMetrics({ ...base(width), cookStep }, { width, route: '/recipes/:id', kind: 'default' }).filter((f) => f.rule === 'P34')
const box = (x: number, y: number, w: number, h: number) => ({ x, y, r: x + w, b: y + h })

describe('P34: the Cook Step text is visible outside the Back/Next tiles at load (SHORT-01)', () => {
  // A phone on its side, 844x390: Back is the left column (x 0-104), Next the right (x 700-844), both under the top row.
  const landscape = (text: ReturnType<typeof box> | null) => ({ innerWidth: 844, innerHeight: 390, text, tiles: [box(0, 56, 104, 334), box(700, 56, 144, 334)] })

  it('is active and always fails (plan section 9)', () => {
    expect(api.RULES.map((r) => r.id)).toContain('P34')
    expect(api.ALWAYS_FAIL).toContain('P34')
  })

  it('passes the side-column layout: the first line sits between the columns', () => {
    expect(run(landscape(box(140, 120, 520, 36)))).toEqual([])
  })

  it('passes the portrait layout with the Step above the nav band', () => {
    expect(run({ innerWidth: 390, innerHeight: 844, text: box(16, 200, 358, 36), tiles: [box(16, 760, 110, 64), box(134, 760, 240, 64)] }, 390)).toEqual([])
  })

  it('reports the beta.8 look: at 568x320 the text is at y 359, below the viewport (0 %)', () => {
    const f = run({ innerWidth: 568, innerHeight: 320, text: box(16, 359, 536, 36), tiles: [box(16, 248, 180, 72), box(204, 248, 348, 72)] }, 568)
    expect(f).toHaveLength(1)
    expect(f[0]!.message).toMatch(/^P34 /)
    expect(f[0]!.message).toMatch(/\b0 % of the first line\b/)
    expect(f[0]!.message).toContain('Back/Next')
  })

  it('reports a first line under a tile (the sticky nav band covers it)', () => {
    const f = run({ innerWidth: 390, innerHeight: 600, text: box(16, 520, 358, 36), tiles: [box(16, 500, 110, 64), box(134, 500, 240, 64)] }, 390)
    expect(f).toHaveLength(1)
    expect(f[0]!.message).toMatch(/\b0 % of the first line\b/)
  })

  it('reports a line the bottom of the viewport cuts in half (50 %)', () => {
    const f = run({ innerWidth: 390, innerHeight: 320, text: box(16, 302, 358, 36), tiles: [] }, 390)
    expect(f).toHaveLength(1)
    expect(f[0]!.message).toMatch(/\b50 % of the first line\b/)
  })

  it('the line is judged by its first line only: a long Step whose later lines go under the nav still passes', () => {
    // The probe sends the first client rect, so the text box here is one line high. (A whole 400 px tall box under the nav would fail.)
    expect(run({ innerWidth: 390, innerHeight: 600, text: box(16, 100, 358, 36), tiles: [box(16, 500, 358, 64)] }, 390)).toEqual([])
  })

  it('80 % visible passes, 79 % reports (the tiles cover the right 20 % or 21 % of the line)', () => {
    const line = box(0, 100, 100, 40)
    const twenty = { innerWidth: 400, innerHeight: 400, text: line, tiles: [box(80, 90, 100, 60)] }
    const twentyOne = { innerWidth: 400, innerHeight: 400, text: line, tiles: [box(79, 90, 100, 60)] }
    expect(run(twenty, 400)).toEqual([])
    const f = run(twentyOne, 400)
    expect(f).toHaveLength(1)
    expect(f[0]!.message).toMatch(/\b79 % of the first line\b/)
  })

  it('two tiles each covering part of the line add up', () => {
    const line = box(100, 100, 200, 40)
    const f = run({ innerWidth: 600, innerHeight: 400, text: line, tiles: [box(0, 90, 160, 60), box(230, 90, 100, 60)] }, 600)
    // visible x 160-230 = 70 of 200 = 35 %
    expect(f).toHaveLength(1)
    expect(f[0]!.message).toMatch(/\b35 % of the first line\b/)
  })

  it('names the sizes so the finding is readable on its own', () => {
    const f = run({ innerWidth: 568, innerHeight: 320, text: box(16, 359, 536, 36), tiles: [] }, 568)
    expect(f[0]!.message).toContain('568x320')
  })

  it('without cookStep metrics (every other page) or without a text box there is nothing to judge', () => {
    expect(run(null)).toEqual([])
    expect(run(undefined)).toEqual([])
    expect(run(landscape(null))).toEqual([])
  })
})

describe('the cook-step probe and the B9-40 scenarios', () => {
  it('the probe fills cookStep on the Cook scenarios only, from page code that reads .cook-step__text and .cook-nav__tile', () => {
    const p = api.PROBES.find((x) => x.name === 'cook-step')!
    expect(p.key).toBe('cookStep')
    expect(p.scenarios).toEqual(['cook-step-landscape', 'cook-step-portrait'])
    expect(p.source).toContain('.cook-step__text')
    expect(p.source).toContain('.cook-nav__tile')
  })

  it('cook-step-landscape runs at the smallest landscape (667x375, amendment A1) and 844x390, for P34', () => {
    const s = api.SCENARIOS.find((x) => x.name === 'cook-step-landscape')!
    expect(s.widths).toEqual(['667x375', '844x390'])
    expect(s.rules).toEqual(['P34'])
    for (const w of s.widths!) expect(api.SCENARIO_VIEWPORTS[String(w)]).toBeTruthy()
  })

  it('cook-step-portrait runs at 375, 390 and 1440 for P34; nothing below 375 px', () => {
    const s = api.SCENARIOS.find((x) => x.name === 'cook-step-portrait')!
    expect(s.widths).toEqual([375, 390, 1440])
    expect(s.rules).toEqual(['P34'])
  })

  it('cook-step-photo (the photo Step with a timer) runs at 390, 834 and 1440 and measures in its setup', () => {
    const s = api.SCENARIOS.find((x) => x.name === 'cook-step-photo')!
    expect(s.widths).toEqual([390, 834, 1440])
    expect(s.setup).toBe('cookStepPhoto')
  })

  it('no B9-40 scenario runs below 375 px wide', () => {
    for (const s of api.SCENARIOS.filter((x) => x.name.startsWith('cook-step'))) {
      for (const w of s.widths ?? []) expect(api.SCENARIO_VIEWPORTS[String(w)]!.width).toBeGreaterThanOrEqual(375)
    }
  })
})

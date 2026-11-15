// B9-13 (DS-05, DS-10, SET-03/12, SSP-03; plan section 9): page-layout rules P24 (always fails), P28, P40 and P41 (by mode), and their probes.
//   scripts/lib/page-layout/rules/P24-title-over-meta.mjs   rowOverlap     [{ sel, label, titleBottom, metaTop }]   probes/row-overlap.mjs
//   scripts/lib/page-layout/rules/P28-nav-meta-cut.mjs      cutNavMeta     [{ sel, label, lines, cutPx }]           probes/nav-meta.mjs
//   scripts/lib/page-layout/rules/P40-narrow-text.mjs       narrowText     [{ sel, label, width }]                  probes/narrow-text.mjs
//   scripts/lib/page-layout/rules/P41-group-title.mjs       untitledGroups [{ sel, label }]                         probes/group-title.mjs
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
  PROBES: { name: string; key: string | null; source: string }[]
  evaluateMetrics: (m: unknown, c: Ctx) => Finding[]
}
interface Ctx { width: number; route: string; kind: string }
interface Finding { rule: string; message: string }

const base = (vw: number) => ({ vw, scrollW: vw, clientW: vw, over: [], content: { x: 24, r: vw - 24 }, railR: 0, container: { x: 24, r: vw - 24 }, pageWidthAttr: 'wide', fields: [], bars: [], railContrast: null, dialog: null, brokenText: [] })
const run = (extra: Record<string, unknown>, rule: string, width = 390, route = '/') =>
  api.evaluateMetrics({ ...base(width), ...extra }, { width, route, kind: 'wide' }).filter((f) => f.rule === rule)

describe('registration', () => {
  // B9-55 (plan section 9, "by mode -> B9-55"): P28, P40 and P41 are always fail at release.
  it('P24 always fails; P28, P40 and P41 always fail since B9-55 (plan section 9)', () => {
    const by = Object.fromEntries(api.RULES.map((r) => [r.id, r]))
    expect(by.P24!.always).toBe(true)
    for (const id of ['P28', 'P40', 'P41']) expect(by[id]!.always, id).toBe(true)
    expect(api.ALWAYS_FAIL).toContain('P24')
    for (const id of ['P28', 'P40', 'P41']) expect(api.ALWAYS_FAIL).toContain(id)
  })
  it('the four probes fill their keys', () => {
    const keys = Object.fromEntries(api.PROBES.map((p) => [p.name, p.key]))
    expect(keys).toMatchObject({ 'row-overlap': 'rowOverlap', 'nav-meta': 'cutNavMeta', 'narrow-text': 'narrowText', 'group-title': 'untitledGroups' })
  })
  it('the probes are in-page IIFEs that read only main', () => {
    for (const p of api.PROBES.filter((x) => ['row-overlap', 'nav-meta', 'narrow-text', 'group-title'].includes(x.name))) {
      expect(p.source.trim().startsWith('(')).toBe(true)
      expect(p.source).toContain("document.querySelector('main')")
    }
  })
})

describe('P24: a row title paints over its meta (DS-05)', () => {
  it('a title that paints 39 px below the meta top is a finding (the Leftovers tile at 320)', () => {
    const f = run({ rowOverlap: [{ sel: 'li.list-row', label: 'Cauliflower al gorgonzola with chestnut mushrooms', titleBottom: 139, metaTop: 100 }] }, 'P24', 320)
    expect(f).toHaveLength(1)
    expect(f[0]!.message).toMatch(/^P24 .*Cauliflower al gorgonzola.*39 px/)
    expect(f[0]!.message).toMatch(/wrapTitle|metaLines/)
  })
  it('a title that ends at, or within 1 px of, the meta top is fine', () => {
    expect(run({ rowOverlap: [{ sel: 'li.list-row', label: 'Chilli', titleBottom: 100, metaTop: 100 }] }, 'P24')).toEqual([])
    expect(run({ rowOverlap: [{ sel: 'li.list-row', label: 'Chilli', titleBottom: 101, metaTop: 100 }] }, 'P24')).toEqual([])
  })
  it('fails at every width, route and kind, and with no metric it says nothing', () => {
    const m = [{ sel: 'li.list-row', label: 'x', titleBottom: 120, metaTop: 100 }]
    for (const w of [375, 390, 1440]) expect(run({ rowOverlap: m }, 'P24', w, '/plan')).toHaveLength(1)
    expect(run({}, 'P24')).toEqual([])
  })
})

describe('P28: a two-line navigation description is cut (DS-10)', () => {
  it('names the row and the fix', () => {
    const f = run({ cutNavMeta: [{ sel: 'span.list-row__meta-text', label: "What you buy and keep but don't cook with", lines: 2, cutPx: 18 }] }, 'P28', 390, '/settings')
    expect(f).toHaveLength(1)
    expect(f[0]!.message).toBe(`P28 span.list-row__meta-text "What you buy and keep but don't cook with" is cut at its second line; shorten the description (system.md 3)`)
  })
  it('nothing cut, nothing said', () => {
    expect(run({ cutNavMeta: [] }, 'P28')).toEqual([])
    expect(run({}, 'P28')).toEqual([])
  })
})

describe('P40: a row title or a field error under 120 px (SET-03, SET-12)', () => {
  it('58 px ("admin@ / examp…" at 320) and 119 px are findings; 120 px is not', () => {
    const f = run(
      {
        narrowText: [
          { sel: 'span.list-row__title', label: 'admin@example.com', width: 58 },
          { sel: 'p.ui-field__error', label: 'Enter a number', width: 119 },
          { sel: 'span.list-row__title', label: 'chiara@example.com', width: 120 },
        ],
      },
      'P40',
      375,
      '/settings/allowlist',
    )
    expect(f.map((x) => x.message.match(/"([^"]+)"/)![1])).toEqual(['admin@example.com', 'Enter a number'])
    expect(f[0]!.message).toMatch(/58 px/)
  })
  it('no metric, no finding', () => {
    expect(run({}, 'P40')).toEqual([])
  })
})

describe('P41: a grouped list without a visible ListGroup title (SSP-03)', () => {
  it('names the unlabelled list and the fix', () => {
    const f = run({ untitledGroups: [{ sel: 'ul.list-group__list', label: 'Kitchen Fridge, 5 Stock Lots' }] }, 'P41', 390, '/pantry')
    expect(f).toHaveLength(1)
    expect(f[0]!.message).toMatch(/^P41 .*Kitchen Fridge, 5 Stock Lots.*title/)
  })
  it('one finding per list', () => {
    const f = run({ untitledGroups: [{ sel: 'ul.list-group__list', label: 'A' }, { sel: 'ul.list-group__list', label: 'B' }] }, 'P41')
    expect(f).toHaveLength(2)
  })
  it('no metric, no finding', () => {
    expect(run({}, 'P41')).toEqual([])
  })
})

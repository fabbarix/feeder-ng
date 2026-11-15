// B9-55 (a11y-finish; plan section 6 "Done" and section 9): the RELEASE STATE of the page-layout guard.
//   - every route fails on every rule: scripts/check-page-layout.modes says `default=fail` (a route added later is guarded too), no
//     warn_routes line, no `width<=N` bridge, no `Pnn@/route` line; scripts/check-page-layout.modes.d/ holds no file (the three it
//     held: 10-width-375-warn, 20-b9-13-p40-p41-warn and 40-b9-52-fail are deleted; the mechanism stays, its tests are in
//     pageLayoutRules.test.ts and pageLayoutModes.ruleWarn.test.ts);
//   - P27, P28, P32, P36, P40, P41 (and P38, P42 once their modules exist) are ALWAYS_FAIL, the plan's "by mode -> B9-55": no reserved
//     rule is still "by mode";
//   - the exempt file lists no route ("Keep this list empty");
//   - the guard's README no longer describes a shipped bridge.
// Tests that name P37, P38 or P42 as ACTIVE depend on the branches still in review (ci/b9-w6a: P38 by B9-32 and P42 by B9-44;
// ci/b9-w6b: P37 by B9-49) and are marked "after w6a/w6b".
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const nodeFs = 'node:fs'
const { existsSync, readFileSync, readdirSync } = (await import(/* @vite-ignore */ nodeFs)) as {
  existsSync: (p: string) => boolean
  readFileSync: (p: string, e: string) => string
  readdirSync: (p: string) => string[]
}
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const scripts = (...p: string[]) => resolve(cwd, '../scripts', ...p)
const api = createRequire(resolve(cwd, 'package.json'))(scripts('lib/page-layout-rules.mjs')) as {
  ROUTES: [string, string][]
  RULES: { id: string; always: boolean }[]
  RESERVED: { id: string; owner: string; mode: 'always' | 'mode' }[]
  ALWAYS_FAIL: string[]
  PROFILES: Record<'quick' | 'full', { width: number }[]>
  modeFor: (text: string, route: string) => 'warn' | 'fail'
  parseModes: (text: string) => { errors: unknown[]; ruleWarn: unknown[]; widthWarn: unknown[] }
  countFindings: (text: string, output: string) => { fail: number; bridged: unknown[] }
  resolveRoute: (pattern: string, ids: Record<string, unknown>) => string
}

const base = readFileSync(scripts('check-page-layout.modes'), 'utf8')
const dropins = readdirSync(scripts('check-page-layout.modes.d')).filter((n) => !n.startsWith('.')).sort()
const all = [base, ...dropins.map((n) => readFileSync(scripts('check-page-layout.modes.d', n), 'utf8'))].join('\n')
const lines = (t: string) => t.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))

describe('modes: every route fails, nothing is bridged or waived', () => {
  it('the base file says default=fail, so a route nobody listed is guarded too', () => {
    expect(lines(base)).toContain('default=fail')
    expect(lines(base).filter((l) => l.startsWith('default='))).toEqual(['default=fail'])
  })
  it('no warn_routes line, no width<=N bridge and no Pnn@/route line is left anywhere', () => {
    for (const l of lines(all)) {
      expect(l, l).not.toMatch(/^warn_routes\s*=/)
      expect(l, l).not.toMatch(/^width\s*<=/)
      expect(l, l).not.toMatch(/^P\d+@/)
    }
    const parsed = api.parseModes(all)
    expect(parsed.errors).toEqual([])
    expect(parsed.ruleWarn).toEqual([])
    expect(parsed.widthWarn).toEqual([])
  })
  it('scripts/check-page-layout.modes.d/ holds no mode file: the warn bridge, the B9-13 drop-in and the B9-52 fail line are deleted', () => {
    expect(dropins).toEqual([])
    for (const n of ['10-width-375-warn', '20-b9-13-p40-p41-warn', '40-b9-52-fail']) expect(existsSync(scripts('check-page-layout.modes.d', n)), n).toBe(false)
  })
  it('every route of the table, resolved, and each of its scenarios (route#name) is a fail route', () => {
    const bad = api.ROUTES.flatMap(([pattern]) => {
      const r = api.resolveRoute(pattern, { recipeId: 7, ingredientId: 7, supplyId: 7, productId: 7, shopId: 7 })
      return [r, `${r}#some-scenario`].filter((x) => api.modeFor(all, x) !== 'fail')
    })
    expect(bad).toEqual([])
  })
  it('a route that is in no list fails too (default=fail)', () => {
    expect(api.modeFor(all, '/a-route-nobody-listed')).toBe('fail')
  })
  it('every finding of every rule fails, at every profile width, 375 included, on every route (nothing is warn or bridged)', () => {
    const widths = [...new Set([...api.PROFILES.quick, ...api.PROFILES.full].map((v) => v.width))]
    expect(widths).toContain(375)
    const out: string[] = []
    let n = 0
    for (const r of api.RULES) for (const w of widths) for (const [route] of api.ROUTES) { out.push(`  - ${w}px ${api.resolveRoute(route, {})}: ${r.id} a finding`); n++ }
    const counted = api.countFindings(all, out.join('\n'))
    expect(counted.fail).toBe(n)
    expect(counted.bridged).toEqual([])
  })
})

describe('rules: every by-mode rule of the plan is always-fail now', () => {
  const FLIPPED = ['P27', 'P28', 'P32', 'P36', 'P40', 'P41']
  it.each(FLIPPED)('%s is in ALWAYS_FAIL (plan section 9: "by mode -> B9-55")', (id) => {
    expect(api.ALWAYS_FAIL).toContain(id)
    expect(api.RULES.find((r) => r.id === id)?.always, id).toBe(true)
  })
  it('no reserved rule is planned "by mode" any more: PLANNED says always for P38 and P42 as well (their modules arrive with w6a)', () => {
    expect(api.RESERVED.filter((r) => r.mode === 'mode').map((r) => r.id)).toEqual([])
  })
  it('P24..P43 are each either an active always-fail rule or reserved as always (after w6a/w6b: all active, none reserved)', () => {
    for (let n = 24; n <= 43; n++) {
      const id = `P${n}`
      const active = api.RULES.find((r) => r.id === id)
      const reserved = api.RESERVED.find((r) => r.id === id)
      expect(Boolean(active) !== Boolean(reserved), `${id} is active or reserved, not both or neither`).toBe(true)
      if (active) expect(active.always, `${id} always`).toBe(true)
      if (reserved) expect(reserved.mode, `${id} planned mode`).toBe('always')
    }
  })
  it('after w6a/w6b: P37, P38 and P42 are active and always-fail, and nothing is reserved any more', () => {
    for (const id of ['P37', 'P38', 'P42']) expect(api.ALWAYS_FAIL, id).toContain(id)
    expect(api.RESERVED).toEqual([])
  })
})

describe('the exempt file and the README', () => {
  it('scripts/check-page-layout.exempt lists no route (every route at every viewport is inspected)', () => {
    expect(lines(readFileSync(scripts('check-page-layout.exempt'), 'utf8'))).toEqual([])
  })
  it('lib/page-layout/README.md describes the bridge and the per-rule warn as mechanisms, not as files that ship: no file names, no "until B9-55"', () => {
    const readme = readFileSync(scripts('lib/page-layout/README.md'), 'utf8')
    expect(readme).not.toMatch(/10-width-375-warn/)
    expect(readme).not.toMatch(/20-b9-13-p40-p41-warn/)
    expect(readme).not.toMatch(/Removed by B9-55/)
    expect(readme).not.toMatch(/the one bridge/)
  })
  it('the driver script header no longer promises the "375 px: N findings, warn until B9-55" line as an example of a live bridge', () => {
    const sh = readFileSync(scripts('check-page-layout.sh'), 'utf8')
    expect(sh).not.toMatch(/warn until B9-55/)
  })
})

describe('cut-meta has nothing pending', () => {
  it('PENDING_ROUTES is empty (pageLayoutRules.b9-29.test.ts pins it; the release leaves no route waiting for a package)', () => {
    const src = readFileSync(scripts('lib/page-layout/probes/cut-meta.mjs'), 'utf8')
    expect(/PENDING_ROUTES\s*=\s*\[\s*\]/.test(src)).toBe(true)
  })
})

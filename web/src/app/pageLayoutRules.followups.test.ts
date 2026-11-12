// QA follow-up FU-4 (1.0.0-beta.4.1): P10 (Button label contrast) is checked in the dark scheme as well as the light one.
// The probe fills `lowContrastButtons` (light, unchanged) and `lowContrastButtonsDark` (same probe after the driver emulates
// prefers-color-scheme: dark); the rule names the scheme in the finding. Pure rule here; the driver is checked as source.
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
  darkButtonFindings: (list?: { label: string; ratio: number }[]) => { rule: string; message: string }[]
}
const base = {
  vw: 820, scrollW: 820, clientW: 820, over: [], content: { x: 24, r: 796 }, railR: 0, container: { x: 24, r: 796 },
  pageWidthAttr: 'full', fields: [], bars: [], railContrast: 7, dialog: null,
}
const run = (extra: Record<string, unknown>) => rules.evaluateMetrics({ ...base, ...extra }, { width: 820, route: '/', kind: 'full' })

describe('P10 in the dark scheme', () => {
  it('a dark-scheme Button under 4.5:1 is a P10 finding that names the Button, the ratio and the scheme', () => {
    const f = run({ lowContrastButtons: [], lowContrastButtonsDark: [{ label: 'Choose a Recipe', ratio: 1.3 }] }).find((x) => x.rule === 'P10')
    expect(f).toBeDefined()
    expect(f!.message).toMatch(/Choose a Recipe/)
    expect(f!.message).toMatch(/1\.3/)
    expect(f!.message).toMatch(/dark/i)
  })
  it('the light finding is unchanged and does not claim dark', () => {
    const f = run({ lowContrastButtons: [{ label: 'Choose a Recipe', ratio: 1.5 }], lowContrastButtonsDark: [] }).find((x) => x.rule === 'P10')
    expect(f!.message).toMatch(/Choose a Recipe.*1\.5/)
    expect(f!.message).not.toMatch(/dark/i)
  })
  it('a Button bad in both schemes gives one finding per scheme', () => {
    const f = run({ lowContrastButtons: [{ label: 'Go', ratio: 2 }], lowContrastButtonsDark: [{ label: 'Go', ratio: 2.2 }] }).filter((x) => x.rule === 'P10')
    expect(f).toHaveLength(2)
  })
  it('no dark findings, or no dark field at all (older probe), is clean', () => {
    expect(run({ lowContrastButtons: [], lowContrastButtonsDark: [] }).map((x) => x.rule)).not.toContain('P10')
    expect(run({ lowContrastButtons: [] }).map((x) => x.rule)).not.toContain('P10')
  })
})

describe('the page-layout driver probes both schemes', () => {
  const src = readFileSync(resolve(cwd, '../scripts/check-page-layout.mjs'), 'utf8')
  it('emulates prefers-color-scheme (dark) and fills lowContrastButtonsDark', () => {
    expect(src).toContain('lowContrastButtonsDark')
    expect(src).toMatch(/Emulation\.setEmulatedMedia/)
    expect(src).toMatch(/prefers-color-scheme/)
  })
  it('puts the scheme back to light for the next route (the tab is also reopened per route)', () => {
    expect(src).toMatch(/value:\s*'light'/)
  })
})

// Review fix: ThemeProvider reads the system scheme once at render and then writes data-scheme, so emulating dark after the load
// changes nothing. The driver has to reload under the emulation, wait for the page, and prove the page really is dark.
describe('the dark pass really renders dark', () => {
  const src = readFileSync(resolve(cwd, '../scripts/check-page-layout.mjs'), 'utf8')
  const after = src.slice(src.indexOf("value: 'dark'"))
  it('reloads or re-navigates after the dark emulation, then settles, before the dark probe', () => {
    expect(src).toContain("value: 'dark'")
    const reload = after.search(/Page\.(reload|navigate)/)
    const settle = after.search(/await settle\(\)/)
    const probe = after.search(/lowContrastButtonsDark\s*=\s*await evaluate\(buttonProbe\)/)
    expect(reload, 'Page.reload or Page.navigate after the emulation').toBeGreaterThanOrEqual(0)
    expect(settle, 'settle() after the reload').toBeGreaterThan(reload)
    expect(probe, 'the dark probe after settle()').toBeGreaterThan(settle)
  })
  it('checks document.documentElement.dataset.scheme === "dark" before the probe and reports an environment problem otherwise', () => {
    const check = after.search(/documentElement\.dataset\.scheme\s*===\s*['"]dark['"]/)
    const probe = after.search(/lowContrastButtonsDark\s*=\s*await evaluate\(buttonProbe\)/)
    expect(check, 'the scheme check').toBeGreaterThanOrEqual(0)
    expect(check).toBeLessThan(probe)
    // an environment problem is reported like the other probe failures ("could not inspect"), never as a clean result
    expect(after.slice(0, probe)).toMatch(/throw new Error|could not (inspect|render)/)
  })
  it('runs the dark pass on every viewport (no width or profile condition around it)', () => {
    const before = src.slice(Math.max(0, src.indexOf("value: 'dark'") - 400), src.indexOf("value: 'dark'"))
    expect(before).not.toMatch(/if\s*\([^)]*(vp\.width|profile|mobile)/)
  })
})

// Review fix 2: the dark pass is isolated, so a dark environment problem never hides or repeats the light findings.
describe('the dark pass is isolated from the light findings', () => {
  const src = readFileSync(resolve(cwd, '../scripts/check-page-layout.mjs'), 'utf8')
  const loop = src.slice(src.indexOf('const started = Date.now()'))
  const dark = loop.indexOf("value: 'dark'")
  const evalAt = loop.indexOf('evaluateMetrics(')
  const failAt = loop.indexOf('fail(`${tag}: ${f.message}`)')
  it('reports the light findings (evaluateMetrics, fail) before the dark emulation', () => {
    expect(dark).toBeGreaterThan(0)
    expect(evalAt).toBeGreaterThanOrEqual(0)
    expect(failAt).toBeGreaterThan(evalAt)
    expect(failAt).toBeLessThan(dark)
  })
  it('has its own try/catch/finally; the media reset to light stays in that finally; the dark error is "could not inspect ... (dark scheme"', () => {
    const fromDark = loop.slice(Math.max(0, loop.lastIndexOf('try {', dark)))
    const tryAt = 0
    const catchAt = fromDark.search(/\}\s*catch\s*\(/)
    const finallyAt = fromDark.search(/\}\s*finally\s*\{/)
    expect(fromDark.startsWith('try {')).toBe(true)
    expect(tryAt).toBe(0)
    expect(catchAt).toBeGreaterThan(0)
    expect(finallyAt).toBeGreaterThan(catchAt)
    const reset = fromDark.search(/value:\s*'light'/)
    expect(reset).toBeGreaterThan(finallyAt)
    expect(fromDark).toMatch(/could not inspect \$\{tag\} \(dark scheme/)
  })
  it('races Page.reload with sleep(', () => {
    expect(loop).toMatch(/Promise\.race\(\[\s*cdp\('Page\.reload'[\s\S]*?sleep\(/)
  })
  it('after the dark probe only the dark P10 findings are reported, never the light ones again', () => {
    const probe = loop.search(/lowContrastButtonsDark\s*=\s*await evaluate\(buttonProbe\)/)
    const after = loop.slice(probe)
    expect(probe).toBeGreaterThan(0)
    // one evaluateMetrics for the light pass only; the dark pass must not call it again with the full metrics
    expect(loop.match(/evaluateMetrics\(/g)).toHaveLength(1)
    expect(after).toContain('darkButtonFindings(')
    expect(after.indexOf('darkButtonFindings(')).toBeLessThan(after.indexOf('finally'))
  })
})

describe('darkButtonFindings (the dark pass reports through this helper, not a partial evaluateMetrics call)', () => {
  it('one low-contrast Button gives exactly one P10 finding with the dark scheme message', () => {
    const f = rules.darkButtonFindings([{ label: 'Choose a Recipe', ratio: 1.3 }])
    expect(f).toHaveLength(1)
    expect(f[0]!.rule).toBe('P10')
    expect(f[0]!.message).toMatch(/Choose a Recipe.*1\.3.*\(dark scheme\)|\(dark scheme\).*Choose a Recipe/)
  })
  it('an empty list gives none, and an undefined list gives none without throwing', () => {
    expect(rules.darkButtonFindings([])).toEqual([])
    expect(() => rules.darkButtonFindings(undefined)).not.toThrow()
    expect(rules.darkButtonFindings(undefined)).toEqual([])
  })
  it('evaluateMetrics reports m.lowContrastButtonsDark with the very same message', () => {
    const entry = { label: 'Go', ratio: 2.2 }
    const viaHelper = rules.darkButtonFindings([entry])[0]!.message
    const viaMetrics = run({ lowContrastButtons: [], lowContrastButtonsDark: [entry] }).filter((x) => x.rule === 'P10')
    expect(viaMetrics.map((x) => x.message)).toEqual([viaHelper])
  })
})

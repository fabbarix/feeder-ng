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

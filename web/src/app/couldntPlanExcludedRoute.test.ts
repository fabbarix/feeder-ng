// CRS G2 (rx-pt.md section 4.1): the route /plan/couldnt-plan/excluded in the shell tables: the feature, the page width,
// the breadcrumbs and the layout guard.
import { describe, expect, it } from 'vitest'
import { routes as planRoutes } from '../features/plan'
import { crumbsFor } from './breadcrumbs'
import { explicitPageWidth, pageWidthFor } from './pageWidths'

const ROUTE = '/plan/couldnt-plan/excluded'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const rules = createRequire(resolve(cwd, 'package.json'))(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as {
  ROUTES: [string, string][]
  modeFor: (text: string, route: string) => 'warn' | 'fail'
}

describe('the Review Exclusions route', () => {
  it('the plan feature registers it next to /plan', () => {
    const paths = planRoutes.map((r) => r.path)
    expect(paths).toContain(ROUTE)
    expect(paths).toContain('/plan')
  })

  it('is a default-width page, listed explicitly (not left to the fallback), and /plan stays wide', () => {
    expect(explicitPageWidth(ROUTE)).toBe('default')
    expect(pageWidthFor(`${ROUTE}#cell-2026-11-13-4-2`)).toBe('default')
    expect(pageWidthFor('/plan')).toBe('wide')
  })

  it('has the breadcrumbs Plan > Review Exclusions, the first a link to the Plan', () => {
    expect(crumbsFor(ROUTE)).toEqual([{ label: 'Plan', to: '/plan' }, { label: 'Review Exclusions' }])
    expect(crumbsFor(`${ROUTE}#cell-2026-11-13-4-2`)).toEqual([{ label: 'Plan', to: '/plan' }, { label: 'Review Exclusions' }])
  })

  it('/plan itself still has no trail', () => expect(crumbsFor('/plan')).toEqual([]))

  it('the layout guard knows it, with the same width as the shell', () => {
    expect(rules.ROUTES).toContainEqual([ROUTE, 'default'])
  })

  it('the modes file fails the layout guard on it', () => {
    const modes = readFileSync(resolve(cwd, '../scripts/check-page-layout.modes'), 'utf8')
    expect(rules.modeFor(modes, ROUTE)).toBe('fail')
    expect(rules.modeFor(modes, '/plan')).toBe('fail')
  })
})

// R2-2: once Today and Plan are fixed, the page-layout guard fails (not warns) on their routes. The modes file is shared with
// R2-1 and R2-3; each team appends its own routes to fail_routes and the PM merges the line.
import { describe, expect, it } from 'vitest'
import { readSource } from '../plan/test-css'

const modes = readSource('../../scripts/check-page-layout.modes')
const failRoutes = (/^fail_routes=(.*)$/m.exec(modes)?.[1] ?? '').split(/\s+/).filter(Boolean)

describe('scripts/check-page-layout.modes (R2-2)', () => {
  it.each(['/', '/plan'])('%s is a fail route', (route) => {
    expect(failRoutes).toContain(route)
  })
})

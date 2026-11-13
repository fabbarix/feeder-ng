// pantry-filter review: the kitchen board takes its scheme from the server's day/night phase, not from prefers-color-scheme, so the
// guard's /board dark pass was "not inspected" whenever it ran in daytime. The guard now pins the phase in the probe: every /api/board
// answer says dark during the dark pass and light otherwise. The /board stays inspected in both schemes, with no exemption.
import { describe, expect, it } from 'vitest'

const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const driver = readFileSync(resolve(cwd, '../scripts/check-page-layout.mjs'), 'utf8')

describe('the /board dark pass is deterministic', () => {
  it('every tab pauses /api/board at the response', () => {
    expect(driver).toMatch(/Fetch\.enable', \{ patterns: \[\{ urlPattern: '\*\/api\/board', requestStage: 'Response' \}\] \}/)
    expect(driver).toMatch(/msg\.method === 'Fetch\.requestPaused'/)
  })
  it('pins the board\'s phase: dark in the dark pass, light otherwise, its next change a day away', () => {
    expect(driver).toMatch(/dark: BOARD_PHASE\.dark/)
    expect(driver).toMatch(/nextChangeAt: new Date\(Date\.now\(\) \+ 86400e3\)/)
    const dark = driver.indexOf('BOARD_PHASE.dark = true')
    const emulate = driver.indexOf("value: 'dark' }] })")
    expect(dark).toBeGreaterThan(0)
    expect(dark).toBeLessThan(emulate)
    expect(driver).toMatch(/finally \{\s*BOARD_PHASE\.dark = false/)
  })
  it('a dark pass whose scheme did not apply is still not inspected (no exemption)', () => {
    expect(driver).toMatch(/data-scheme is not dark; the scheme emulation did not apply/)
    expect(readFileSync(resolve(cwd, '../scripts/check-page-layout.exempt'), 'utf8')).not.toMatch(/\/board/)
  })
})

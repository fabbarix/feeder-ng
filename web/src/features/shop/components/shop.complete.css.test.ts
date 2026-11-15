// B9-43 (SSP-09; mocks/ssp-09-complete.html): the complete tile's CSS: the rows sit on the success tint (DetailList), the buttons wrap under
// them and are never crushed (R-A: they look like buttons, their text is never clipped), and the old facts list is gone.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/shop/shop.css`, 'utf8')
const rules = (selector: string): string => {
  const out: string[] = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  for (let m = re.exec(css); m; m = re.exec(css)) if (m[1]!.split(',').some((s) => s.trim() === selector)) out.push(m[2]!)
  return out.join('\n')
}

describe('shop.css: the complete tile (SSP-09)', () => {
  it('the actions are a wrapping row (a column on a narrow tile) and the buttons are never shrunk below their text', () => {
    const actions = rules('.celebration-tile__actions')
    expect(actions).toMatch(/display:\s*flex/)
    expect(actions).toMatch(/flex-wrap:\s*wrap/)
    expect(css).toMatch(/\.celebration-tile__actions\s*>\s*\*[^{]*\{[^}]*(flex-shrink:\s*0|flex:\s*none|min-inline-size)/)
  })

  it('the old "facts" list (muted bullets) has no rule left', () => {
    expect(css).not.toMatch(/\.celebration-tile__facts/)
  })

  it('the tile keeps the grid gap and starts its content at the start edge (rows full width)', () => {
    const tile = rules('.celebration-tile')
    expect(tile).toMatch(/display:\s*grid/)
    expect(tile).not.toMatch(/justify-items:\s*start/)
  })
})

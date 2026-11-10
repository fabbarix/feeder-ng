import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/stock/stock.css`, 'utf8')

// R10: on a phone the "went off" text wraps under the amount and a "· " separator was left stranded in front of it.
describe('stock.css spoiled tile detail', () => {
  it('has no generated "· " separator before the go-off wording', () => {
    expect(css).not.toMatch(/spoiled-tile__when::before/)
    expect(css).not.toMatch(/content:\s*['"]·/)
  })

  it('separates the amount from the wording with a gap that survives wrapping', () => {
    const start = css.indexOf('.spoiled-tile__detail {')
    const block = css.slice(start, css.indexOf('}', start))
    expect(block).toMatch(/column-gap:\s*var\(--space-2\)/)
    expect(block).toMatch(/flex-wrap:\s*wrap/)
  })
})

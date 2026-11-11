import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/stock/stock.css`, 'utf8')

// R10: a "· " separator was left stranded in front of the wrapped wording; L-07 moved the amount and wording into one ListRow meta string.
describe('stock.css spoiled tile detail', () => {
  it('has no generated "· " separator before the go-off wording', () => {
    expect(css).not.toMatch(/spoiled-tile__when::before/)
    expect(css).not.toMatch(/content:\s*['"]·/)
  })
})

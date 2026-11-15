// B9-50 (SSP-19, A11Y-09): the receipt photo row. A thumbnail has a frame (1 px --color-line, --radius-thumb, --color-surface-2 behind the image),
// so a white photo does not vanish on the white row; the row's Edit and Remove are an IconSet whose gap is the token's, never a gap of the row.
// vitest blanks CSS imports, so the stylesheet is read from disk.
import { describe, expect, it } from 'vitest'
import { declarations } from '../../ui/test-utils'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/receipt/receipt.css`, 'utf8')

describe('receipt.css: the photo thumbnail frame', () => {
  const d = () => declarations(css, '.receipt-photo .thumb')
  it('has a 1 px --color-line border', () => {
    expect(d()['border']).toBe('1px solid var(--color-line)')
  })
  it('has the thumb radius', () => {
    expect(d()['border-radius']).toBe('var(--radius-thumb)')
  })
  it('has --color-surface-2 behind the image', () => {
    expect(d()['background']).toBe('var(--color-surface-2)')
  })
})

describe('receipt.css: the photo row\'s icons are an IconSet', () => {
  it('the row sets no gap of its own between Edit and Remove: --icon-set-gap does', () => {
    expect(css).not.toMatch(/\.receipt-photo[^{]*\.icon-set[^{]*\{[^}]*\bgap\b/)
    const row = declarations(css, '.receipt-photo')
    expect(row['grid-template-columns']).not.toMatch(/auto\s+auto\s*$/)
  })
})

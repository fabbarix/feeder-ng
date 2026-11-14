// b8-hint (docs/dev/design/b8-hint.md): below 420 px the Shop hint ("Wed Breakfast +12", the widest real one) fits a 360 px row.
// The row gives its text column room through tokens: 8 px gaps, the tick's hit area reaching into the start padding, a value
// column 8 px under the phone minimum. No raw rem and no copy change.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/shop/shop.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const start = css.indexOf('@media (width < 420px)')
const narrow = start < 0 ? '' : css.slice(start, css.indexOf('\n}', start) + 2)

describe('Shop rows below 420 px: the hint has room', () => {
  it('has a below-420 px block (the useNarrowChips breakpoint)', () => {
    expect(start).toBeGreaterThan(-1)
  })
  it('the row gap is --space-2 and the value column is the phone minimum less --space-2', () => {
    expect(narrow).toMatch(/\.shop-lines \.list-row\s*\{[^}]*gap\s*:\s*var\(--space-2\)/)
    expect(narrow).toMatch(/\.shop-lines \.list-row\s*\{[^}]*--row-value-min\s*:\s*calc\(var\(--row-value-narrow\)\s*-\s*var\(--space-2\)\)/)
  })
  it('the tick keeps its 44 px hit area and reaches into the start padding, by --space-2 (shop.css keeps 44px for the tick itself)', () => {
    expect(narrow).toMatch(/\.shop-lines \.list-row__control\s*\{[^}]*margin-inline-start\s*:\s*calc\(-1\s*\*\s*var\(--space-2\)\)/)
    const control = narrow.match(/\.shop-lines \.list-row__control\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(control).not.toMatch(/size\s*:|width\s*:|height\s*:/)
  })
  it('no raw rem in the block', () => {
    expect(narrow).not.toMatch(/\d(\.\d+)?rem/)
  })
})

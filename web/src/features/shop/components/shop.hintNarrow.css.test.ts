// b8-hint (docs/dev/design/b8-hint.md), B9-09 (DS-09): below 24 rem of the screen's own width (a container query, was 420 px of viewport) the Shop hint ("Wed Breakfast +12", the widest real one) fits a 360 px row.
// The row gives its text column room through tokens: 12 px padding, 8 px gaps, the tick's hit area reaching into the start padding, a value
// column 8 px under the phone minimum. No raw rem and no copy change.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/shop/shop.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const start = css.indexOf('@container (width < 24rem)')
const narrow = start < 0 ? '' : css.slice(start, css.indexOf('\n}', start) + 2)

describe('Shop rows below 24 rem: the hint has room', () => {
  it('has a below-24 rem container block, and shop.css declares the container (container-type: inline-size)', () => {
    expect(start).toBeGreaterThan(-1)
    expect(css).toMatch(/container-type:\s*inline-size/)
  })
  it('the row gap is --space-2, its padding --space-3, and the value column is the phone minimum less --space-2', () => {
    expect(narrow).toMatch(/\.shop-lines \.list-row\s*\{[^}]*gap\s*:\s*var\(--space-2\)/)
    expect(narrow).toMatch(/\.shop-lines \.list-row\s*\{[^}]*padding-inline\s*:\s*var\(--space-3\)/)
    expect(narrow).toMatch(/\.shop-lines \.list-row\s*\{[^}]*--row-value-min\s*:\s*calc\(var\(--row-value-narrow\)\s*-\s*var\(--space-2\)\)/)
  })
  it('the tick keeps its 44 px hit area and reaches into the start padding, by --space-2 (shop.css keeps 44px for the tick itself)', () => {
    expect(narrow).toMatch(/\.shop-lines \.list-row__control\s*\{[^}]*margin-inline-start\s*:\s*calc\(-1\s*\*\s*var\(--space-2\)\)/)
    const control = narrow.match(/\.shop-lines \.list-row__control\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(control).not.toMatch(/size\s*:|width\s*:|height\s*:/)
  })
  // Reviewer (B9-09): the slice starts at the block's own head, `@container (width < 24rem)`, whose 24rem is the threshold, not a
  // value inside the block; only the declarations after the head's `{` are checked.
  it('no raw rem in the block', () => {
    const body = narrow.slice(narrow.indexOf('{') + 1)
    expect(body).not.toBe('')
    expect(body).not.toMatch(/\d(\.\d+)?rem/)
  })
})

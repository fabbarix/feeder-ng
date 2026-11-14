// b8-shop: the Shop hint in the card grid (docs/dev/design/b8-shop.md 2). The card's text column gets room: the value column takes the
// phone minimum from 768 px, with a token and no raw size.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/shop/shop.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const styles = readFileSync(`${cwd}/src/styles.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const listCss = readFileSync(`${cwd}/src/ui/ListRow.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const wide = css.slice(css.indexOf('@media (min-width: 768px)'))

describe('Shop card grid: the hint has room', () => {
  it('from 768 px a Shop row takes the narrow value column through a token (no raw rem in shop.css)', () => {
    expect(wide).toMatch(/\.shop-lines \.list-row\s*\{[^}]*--row-value-min\s*:\s*var\(--row-value-narrow\)/)
    expect(styles).toMatch(/--row-value-narrow\s*:\s*4\.25rem/)
    expect(styles).toMatch(/max-width:\s*599px\)\s*\{[^}]*--row-value-min\s*:\s*var\(--row-value-narrow\)/)
  })
  it('the meta line stays one line with an ellipsis (system.md 3): nothing in the Shop lets it wrap', () => {
    expect(listCss).toMatch(/\.list-row__meta-text\s*\{[^}]*white-space:\s*nowrap/)
    expect(css).not.toMatch(/list-row__meta[^{]*\{[^}]*white-space:\s*(normal|pre-wrap)/)
  })
})

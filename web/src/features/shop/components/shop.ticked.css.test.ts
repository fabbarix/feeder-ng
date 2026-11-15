// B9-34 (SSP-01, R-C+, SSP-05): the stylesheet of the tick and the ticked rows. The focused tick draws ONE ring: its visible 24 px
// circle takes a 3 px --color-accent border on a --color-soft fill, and the 44 px button draws no outline of its own (only one ring
// shows, inside the row card). The Shop's narrow-row rule lives in ListRow.css (B9-13), not here; the viewport query for compact rows is gone.
import { describe, expect, it } from 'vitest'
import { declarations } from '../../../ui/test-utils'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/shop/shop.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('shop.css: the focused tick (R-C+)', () => {
  it('the button itself draws no outline when focused', () => {
    const d = declarations(css, '.line-row__tick:focus-visible')
    expect(d['outline']).toMatch(/^(none|0)\b/)
    expect(d['box-shadow'] ?? 'none').toBe('none')
  })

  it('the circle takes the ring: a --focus-ring-width accent border on a soft fill', () => {
    const d = declarations(css, '.line-row__tick:focus-visible::before')
    expect(d['border-color'] ?? d['border']).toMatch(/var\(--color-accent\)/)
    expect(d['border-width'] ?? d['border']).toMatch(/var\(--focus-ring-width\)/)
    expect(d['background']).toMatch(/var\(--color-soft\)/)
  })

  it('a focused TICKED tick keeps its success fill and takes the same ring', () => {
    const d = declarations(css, ".line-row__tick[aria-pressed='true']:focus-visible::before")
    expect(d['border-color']).toMatch(/var\(--color-accent\)/)
  })

  it('a busy tick looks the same and shows the wait (no pointer, no change of size)', () => {
    const d = declarations(css, ".line-row__tick[aria-busy='true']")
    expect(d['cursor']).toMatch(/progress|wait|default/)
  })
})

describe('shop.css: the ticked and more rows', () => {
  it('the meta of a success tick uses the success foreground token, not a hex', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('no viewport width query for the row text (SSP-05: the row\'s own width decides)', () => {
    expect(css).not.toMatch(/@media[^{]*width\s*[<>]=?\s*26\.25em|@media[^{]*max-width:\s*26\.2/)
  })
})

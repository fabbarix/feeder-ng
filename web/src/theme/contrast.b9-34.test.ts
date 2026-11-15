// B9-34 (SSP-01, R-C+; the chapter's figures): the pairs of the ticked row and the focused tick, on the default accent, light and dark.
//   success-fg on surface   8.7:1 light, 11.75:1 dark   (the "+500 g in Stock" meta, the additions' amounts)
//   muted on surface        7.23:1 light, 8.75:1 dark   (the ticked row's muted meta, the value column)
//   accent ring on soft     3.4:1 light, 3.6:1 dark     (the focused tick: 3 px --color-accent on --color-soft, R-C+; non-text, 3:1 needed)
// Read from styles.css (the tokens as shipped), so a change to a token that breaks a figure fails here.
import { describe, expect, it } from 'vitest'
import { contrastRatio, type Hex } from './color'
import { readStylesCss } from '../ui/test-utils'

const css = readStylesCss().replace(/\/\*[\s\S]*?\*\//g, '')
/** The token's value in the first block that sets it after `marker` ('' = the file start): the light value is the :root one, the dark one the (prefers-color-scheme: dark) one. */
function token(name: string, scheme: 'light' | 'dark'): Hex {
  const all = [...css.matchAll(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`, 'g'))].map((m) => m[1]!.toLowerCase() as Hex)
  // :root (light) first, then the dark block(s); the forced-dark block repeats the dark value
  return scheme === 'light' ? all[0]! : all[1]!
}
const ratio = (fg: string, bg: string, scheme: 'light' | 'dark') => contrastRatio(token(fg, scheme), token(bg, scheme))

describe('B9-34 contrast: the ticked row and the focused tick', () => {
  it('success-fg on surface: 8.7:1 light, 11.75:1 dark', () => {
    expect(ratio('--status-success-fg', '--color-surface', 'light')).toBeGreaterThanOrEqual(8.7)
    expect(ratio('--status-success-fg', '--color-surface', 'dark')).toBeGreaterThanOrEqual(11.7)
  })

  it('muted on surface: 7.2:1 light, 8.7:1 dark', () => {
    expect(ratio('--color-muted', '--color-surface', 'light')).toBeGreaterThanOrEqual(7.2)
    expect(ratio('--color-muted', '--color-surface', 'dark')).toBeGreaterThanOrEqual(8.7)
  })

  it('the focused tick\'s accent ring on its soft fill is at least 3:1 (non-text), 3.4 light and 3.6 dark', () => {
    expect(ratio('--color-accent', '--color-soft', 'light')).toBeGreaterThanOrEqual(3.4)
    expect(ratio('--color-accent', '--color-soft', 'dark')).toBeGreaterThanOrEqual(3.6)
  })
})

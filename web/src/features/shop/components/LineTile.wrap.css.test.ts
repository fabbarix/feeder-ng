// SF1 defect 3: at 1280 px (auto-fill 240 px tiles) "passata 700 g" broke as "Pass / ata / 700 / g".
// Cause: .line-tile__title has overflow-wrap: anywhere (min-content collapses to one letter) and .line-tile__quantity may wrap at its space.
import { describe, expect, it } from 'vitest'
import { declarations } from '../../../ui/test-utils'
import { readSource } from '../../plan/test-css'

const css = readSource('features/shop/shop.css')

describe('shop.css, a Shopping List line wraps by word (SF1)', () => {
  it('the name breaks between words (break-word, not anywhere) and clamps to two lines', () => {
    const d = declarations(css, '.line-tile__title')
    expect(d['overflow-wrap']).toBe('break-word')
    expect(d['-webkit-line-clamp']).toBe('2')
    expect(d['overflow']).toBe('hidden')
  })

  it('the quantity stays together on one line', () => {
    expect(declarations(css, '.line-tile__quantity')['white-space']).toBe('nowrap')
  })

  it('the text column can still shrink: minmax(0, 1fr) and a body with min-width 0', () => {
    expect(declarations(css, '.line-tile')['grid-template-columns']).toMatch(/minmax\(0, ?1fr\)/)
    expect(declarations(css, '.line-tile__body')['min-width']).toBe('0')
  })
})

// Beta.5 WP D: the glyphs Leftovers, Shopping List and Guests need (docs/dev/design/b5-d-shared-web.md).
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Icon } from './Icon'
import { icons, type IconName } from './icons'

const svg = (name: IconName) => {
  const { container, unmount } = render(<Icon name={name} />)
  const html = container.querySelector('svg')?.innerHTML
  unmount()
  return html
}

describe('beta.5 glyphs', () => {
  it.each(['snowflake', 'question', 'shoppingCart', 'guests'])('%s is registered and draws', (name) => {
    expect(Object.keys(icons)).toContain(name)
    expect(svg(name as IconName)).toBeTruthy()
  })

  it('snowflake and question share the glyphs of freezer and unknownBarcode', () => {
    expect(svg('snowflake' as IconName)).toBe(svg('freezer'))
    expect(svg('question' as IconName)).toBe(svg('unknownBarcode'))
  })

  it('shoppingCart is a cart, not the shop basket; guests is not the members glyph', () => {
    expect(svg('shoppingCart' as IconName)).not.toBe(svg('shop'))
    expect(svg('guests' as IconName)).not.toBe(svg('members'))
  })
})

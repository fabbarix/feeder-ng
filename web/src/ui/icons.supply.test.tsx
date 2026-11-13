// H5: one Phosphor glyph for Supply (design household-items.md section 6: SprayBottle), through the shared registry only.
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

describe('supply glyph', () => {
  it('is registered and draws', () => {
    expect(Object.keys(icons)).toContain('supply')
    expect(svg('supply' as IconName)).toBeTruthy()
  })
  it('is not the ingredients carrot, the products bag or the stock package', () => {
    for (const other of ['ingredients', 'products', 'stock'] as const) expect(svg('supply' as IconName)).not.toBe(svg(other))
  })
})

// B9-27 (RX-05): one Phosphor glyph for "opens in a new tab": ArrowSquareOut, registered as `external` (additive: no existing name changes).
// The Recipe detail's Source link draws it after the host, hidden from assistive technology (the link's name says "opens in a new tab").
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/csr/ArrowSquareOut'
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

describe('external glyph', () => {
  it('is registered as Phosphor ArrowSquareOut and draws', () => {
    expect(Object.keys(icons)).toContain('external')
    expect((icons as Record<string, unknown>).external).toBe(ArrowSquareOutIcon)
    expect(svg('external')).toBeTruthy()
  })
  it('is not the link glyph', () => {
    expect(svg('external')).not.toBe(svg('link'))
  })
})

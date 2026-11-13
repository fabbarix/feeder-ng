// beta.7 SR2: one Phosphor glyph for "Read the receipt" (receipt-reading.md 3.1: a ListRow with the Phosphor `Receipt` icon),
// through the shared registry only.
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Icon } from './Icon'
import { icons, type IconName } from './icons'
import { readSource } from '../features/plan/test-css'

const svg = (name: IconName) => {
  const { container, unmount } = render(<Icon name={name} />)
  const html = container.querySelector('svg')?.innerHTML
  unmount()
  return html
}

describe('receipt glyph', () => {
  it('is registered and draws', () => {
    expect(Object.keys(icons)).toContain('receipt')
    expect(svg('receipt' as IconName)).toContain('<path')
  })

  it('is not the price coins, the clipboard or the file glyph', () => {
    for (const other of ['price', 'clipboard', 'file'] as const) expect(svg('receipt' as IconName)).not.toBe(svg(other))
  })

  it('imports Phosphor Receipt from its own module (never the barrel)', () => {
    const src = readSource('ui/icons.ts')
    expect(src).toMatch(/from '@phosphor-icons\/react\/dist\/csr\/Receipt'/)
    expect(src).toMatch(/\n\s*receipt:\s*ReceiptIcon,/)
  })
})

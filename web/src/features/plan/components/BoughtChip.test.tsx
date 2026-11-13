import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BoughtChip } from './BoughtChip'

describe('BoughtChip', () => {
  it('is a neutral chip reading Bought with a decorative cart glyph', () => {
    const { container } = render(<BoughtChip />)
    const chip = screen.getByText('Bought').closest('.chip')
    expect(chip).not.toBeNull()
    expect(chip).toHaveAttribute('data-kind', 'why')
    expect(chip).not.toHaveAttribute('data-status')
    expect(container.querySelector('.chip svg')).toHaveAttribute('aria-hidden', 'true')
  })
})

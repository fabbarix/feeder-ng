import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StreakTile } from './StreakTile'

describe('StreakTile', () => {
  it('is a success-toned half tile with a big number and a short label', () => {
    const { container } = render(<StreakTile days={21} />)
    expect(screen.getByText('3 wk')).toBeInTheDocument()
    expect(screen.getByText('zero-waste streak')).toBeInTheDocument()
    const tile = container.querySelector('[data-variant="status"]')!
    expect(tile).toHaveAttribute('data-span', '1')
    expect(tile).toHaveAttribute('data-status', 'success')
    expect(screen.queryByText(/without throwing food away/)).not.toBeInTheDocument()
  })

  // R11b N8: the streak tile must not stretch to the height of the row (a big empty block next to Use soon).
  it('carries the class that opts out of row stretching', () => {
    const { container } = render(<StreakTile days={21} />)
    expect(container.querySelector('.tile')).toHaveClass('today-streak')
  })

  it('does not say the metric label twice: no heading, the label appears once', () => {
    render(<StreakTile days={21} />)
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.getAllByText(/zero-waste streak/i)).toHaveLength(1)
  })

  it('is named for assistive technology', () => {
    render(<StreakTile days={5} />)
    expect(screen.getByRole('region', { name: 'Zero-waste streak' })).toBeInTheDocument()
    expect(screen.getByText('5 d')).toBeInTheDocument()
  })

  it('renders nothing for zero days', () => {
    const { container } = render(<StreakTile days={0} />)
    expect(container).toBeEmptyDOMElement()
  })
})

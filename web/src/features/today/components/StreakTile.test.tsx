import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StreakTile } from './StreakTile'

describe('StreakTile', () => {
  it('shows the number of days under the heading', () => {
    render(<StreakTile days={5} />)
    expect(screen.getByRole('heading', { name: 'Zero-waste streak' })).toBeInTheDocument()
    expect(screen.getByText('5 days without throwing food away')).toBeInTheDocument()
  })

  it('uses the singular for one day', () => {
    render(<StreakTile days={1} />)
    expect(screen.getByText('1 day without throwing food away')).toBeInTheDocument()
  })

  it('renders nothing for zero days', () => {
    const { container } = render(<StreakTile days={0} />)
    expect(container).toBeEmptyDOMElement()
  })
})

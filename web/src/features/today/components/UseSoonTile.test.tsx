import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { UseSoonTile } from './UseSoonTile'

describe('UseSoonTile', () => {
  it('lists each Ingredient with when it goes off', () => {
    render(
      <UseSoonTile
        items={[
          { ingredientId: 1, name: 'Spinach', when: 'Goes off in 2 days' },
          { ingredientId: 2, name: 'Chicken thighs', when: 'Goes off today' },
        ]}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Use soon' })).toBeInTheDocument()
    expect(screen.getByText('Spinach')).toBeInTheDocument()
    expect(screen.getByText('Goes off in 2 days')).toBeInTheDocument()
    expect(screen.getByText('Goes off today')).toBeInTheDocument()
  })

  it('uses the spoil tone, never an accent colour', () => {
    const { container } = render(<UseSoonTile items={[{ ingredientId: 1, name: 'Spinach', when: 'Goes off in 2 days' }]} />)
    expect(container.querySelector('[data-tone="spoil"]')).not.toBeNull()
  })

  it('renders nothing when empty', () => {
    const { container } = render(<UseSoonTile items={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

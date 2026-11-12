import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BoughtLine } from './BoughtLine'

describe('BoughtLine', () => {
  it('says what was bought and that automatic changes leave it', () => {
    render(<BoughtLine bought={{ ingredients: [{ id: 1, name: 'chicken thighs' }, { id: 2, name: 'cream' }] }} />)
    expect(screen.getByText('Bought for it: chicken thighs, cream. Automatic plan changes leave it as it is.')).toBeInTheDocument()
  })
  it('renders nothing when not Bought', () => {
    const { container } = render(<BoughtLine bought={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})

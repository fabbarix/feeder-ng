import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RuleWarningLine } from './RuleWarningLine'

describe('RuleWarningLine', () => {
  it('shows the warn line as a note', () => {
    render(<RuleWarningLine warning={{ code: 'excluded', memberId: 3, ingredientId: 9 }} context={{ memberName: () => 'Sam', ingredientName: () => 'garlic' }} />)
    expect(screen.getByRole('note')).toHaveTextContent('Sam now excludes garlic, which this uses. Swap it to change it.')
  })
  it('renders nothing without a warning', () => {
    const { container } = render(<RuleWarningLine warning={null} context={{}} />)
    expect(container).toBeEmptyDOMElement()
  })
})

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemberPill } from './MemberPill'

describe('MemberPill', () => {
  it('shows the Member colour, an avatar and the name', () => {
    const { container } = render(<MemberPill name="Anna" colour="#3366cc" />)
    expect(screen.getByText('Anna')).toBeInTheDocument()
    expect(container.querySelector('[data-member-colour="#3366cc"]')).not.toBeNull()
    expect(screen.getByRole('img', { name: 'Anna' })).toHaveTextContent('A')
  })
  it('shows the emoji instead of the initials', () => {
    render(<MemberPill name="Sam" colour="#81b29a" glyph="🦊" />)
    expect(screen.getByRole('img', { name: 'Sam' })).toHaveTextContent('🦊')
  })
  it('uses the first name only', () => {
    render(<MemberPill name="Lucia Maria Bernadette" colour="#e07a5f" />)
    expect(screen.getByText('Lucia')).toBeInTheDocument()
    expect(screen.queryByText(/Bernadette/)).toBeNull()
  })
})

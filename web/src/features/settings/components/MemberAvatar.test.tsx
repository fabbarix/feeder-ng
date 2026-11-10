import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemberAvatar } from './MemberAvatar'

describe('MemberAvatar', () => {
  it('is the shared Avatar (initials, named) inside a ring in the Member colour', () => {
    render(<MemberAvatar name="Anna" colour="#3366cc" />)
    const avatar = screen.getByRole('img', { name: 'Anna' })
    expect(avatar).toHaveTextContent('A')
    const ring = avatar.closest('[data-member-colour]')!
    expect(ring).toHaveAttribute('data-member-colour', '#3366cc')
    expect((ring as HTMLElement).style.getPropertyValue('--member-colour')).toBe('#3366cc')
  })

  it('shows the Member\'s emoji avatar text instead of initials when they have one', () => {
    render(<MemberAvatar name="Sam" colour="#81b29a" avatar="🦊" />)
    expect(screen.getByRole('img', { name: 'Sam' })).toHaveTextContent('🦊')
  })

  it('passes the size through', () => {
    render(<MemberAvatar name="Anna" colour="#3366cc" size="lg" />)
    expect(screen.getByRole('img', { name: 'Anna' })).toHaveAttribute('data-size', 'lg')
  })
})

// A1 phase 2: a Member's email is shown in the Members list like the name (to every User, read-only for a plain User).
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { anna, marco } from './fixtures'
import { MemberList } from './MemberList'

describe('MemberList: Member email', () => {
  it('shows the email in the Member\'s row, when there is one', () => {
    render(<MemberList members={[{ ...anna, email: 'anna@example.test' }, { ...marco, email: null }]} canEdit onAdd={() => {}} onEdit={() => {}} />)
    const row = screen.getByRole('button', { name: /^Anna/ }).closest('li')!
    expect(row).toHaveTextContent('anna@example.test')
    expect(screen.getByRole('button', { name: /^Marco/ }).closest('li')).not.toHaveTextContent('@')
  })

  it('shows it to a plain User too', () => {
    render(<MemberList members={[{ ...anna, email: 'anna@example.test' }]} canEdit={false} onAdd={() => {}} onEdit={() => {}} />)
    expect(screen.getByText(/anna@example\.test/)).toBeInTheDocument()
  })

  it('keeps the linked User name when both are present (meta reads "Cook · anna@example.test" in any order, no other text)', () => {
    render(<MemberList members={[{ ...anna, email: 'anna@example.test' }]} canEdit linkedUserNames={{ 2: 'Cook' }} onAdd={() => {}} onEdit={() => {}} />)
    const meta = screen.getByText(/anna@example\.test/)
    expect(meta.textContent).toMatch(/Cook/)
  })
})

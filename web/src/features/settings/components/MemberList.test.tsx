import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { anna, members, sam } from './fixtures'
import { MemberList } from './MemberList'

describe('MemberList', () => {
  it('rings each Avatar in the Member colour (5.14: not all accent green)', () => {
    render(<MemberList members={members} canEdit onAdd={() => {}} onEdit={() => {}} />)
    for (const m of members) {
      const ring = screen.getByRole('img', { name: m.name }).closest('[data-member-colour]')
      expect(ring, m.name).toHaveAttribute('data-member-colour', m.colour)
    }
    expect(document.querySelector('.settings__dot')).toBeNull() // the small dot is gone
  })

  it('is a ListGroup of rows: name, linked-User meta, tappable for an Admin', () => {
    render(<MemberList members={members} canEdit linkedUserNames={{ 2: 'Cook' }} onAdd={() => {}} onEdit={() => {}} />)
    expect(screen.getByRole('list', { name: 'Members' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anna' }).closest('li')).toHaveTextContent('Cook')
  })

  it('lists each Member with their default Portion Factor', () => {
    render(<MemberList members={members} canEdit onAdd={() => {}} onEdit={() => {}} />)
    expect(screen.getByText('Anna')).toBeInTheDocument()
    expect(screen.getByText('Sam')).toBeInTheDocument()
    expect(screen.getByText('×0.5')).toBeInTheDocument()
    expect(screen.getAllByText('×1')).toHaveLength(2)
    expect(screen.queryByText(/Portion Factor \d/)).toBeNull() // UI-fix copy: trailing "×1.25", the label lives in the editor
  })

  it('marks Members who are linked to a User', () => {
    render(<MemberList members={members} canEdit linkedUserNames={{ 2: 'Cook' }} onAdd={() => {}} onEdit={() => {}} />)
    expect(screen.getByText('Cook')).toBeInTheDocument()
  })

  it('lets an Admin add and edit', async () => {
    const onAdd = vi.fn()
    const onEdit = vi.fn()
    render(<MemberList members={[anna, sam]} canEdit onAdd={onAdd} onEdit={onEdit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add Member' }))
    expect(onAdd).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Sam' })) // the whole row is the target (ListRow)
    expect(onEdit).toHaveBeenCalledWith(sam)
  })

  it('is read-only for a plain User', () => {
    render(<MemberList members={members} canEdit={false} onAdd={() => {}} onEdit={() => {}} />)
    expect(screen.getByText('Anna')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Member' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Anna|Sam|Marco/ })).toBeNull() // static rows
  })

  it('invites the Admin to add the first Member', () => {
    render(<MemberList members={[]} canEdit onAdd={() => {}} onEdit={() => {}} />)
    expect(screen.getByText(/no Members yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Member' })).toBeInTheDocument()
  })
})

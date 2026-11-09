import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { anna, members, sam } from './fixtures'
import { MemberList } from './MemberList'

describe('MemberList', () => {
  it('lists each Member with their default Portion Factor', () => {
    render(<MemberList members={members} canEdit onAdd={() => {}} onEdit={() => {}} />)
    expect(screen.getByText('Anna')).toBeInTheDocument()
    expect(screen.getByText('Sam')).toBeInTheDocument()
    expect(screen.getByText('Portion Factor 0.5')).toBeInTheDocument()
    expect(screen.getAllByText('Portion Factor 1')).toHaveLength(2)
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
    await userEvent.click(screen.getByRole('button', { name: 'Edit Sam' }))
    expect(onEdit).toHaveBeenCalledWith(sam)
  })

  it('is read-only for a plain User', () => {
    render(<MemberList members={members} canEdit={false} onAdd={() => {}} onEdit={() => {}} />)
    expect(screen.getByText('Anna')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Member' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull()
  })

  it('invites the Admin to add the first Member', () => {
    render(<MemberList members={[]} canEdit onAdd={() => {}} onEdit={() => {}} />)
    expect(screen.getByText(/no Members yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Member' })).toBeInTheDocument()
  })
})

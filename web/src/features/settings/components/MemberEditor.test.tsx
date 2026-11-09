import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { sam } from './fixtures'
import { MemberEditor } from './MemberEditor'

const users = [
  { id: 1, displayName: 'Admin', email: 'admin@example.test' },
  { id: 2, displayName: 'Cook', email: 'cook@example.test' },
]

describe('MemberEditor', () => {
  it('renders nothing when closed', () => {
    render(<MemberEditor open={false} users={users} onSave={() => {}} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('adds a Member starting at Portion Factor 1', async () => {
    const onSave = vi.fn()
    render(<MemberEditor open users={users} onSave={onSave} onClose={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Add Member' })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Name'), 'Anna')
    await userEvent.click(screen.getByRole('button', { name: 'Save Member' }))
    expect(onSave).toHaveBeenCalledWith({ name: 'Anna', colour: expect.stringMatching(/^#[0-9a-f]{6}$/i), avatar: '', portionFactor: 1 }, null)
  })

  it('steps the Portion Factor by 0.25 within 0.25..3', async () => {
    const onSave = vi.fn()
    render(<MemberEditor open users={users} onSave={onSave} onClose={() => {}} />)
    await userEvent.type(screen.getByLabelText('Name'), 'Sam')
    const down = screen.getByRole('button', { name: 'Decrease Portion Factor' })
    await userEvent.click(down)
    await userEvent.click(down)
    expect(screen.getByText('0.5')).toBeInTheDocument()
    await userEvent.click(down)
    await userEvent.click(down)
    expect(down).toBeDisabled()
    expect(screen.getByText('0.25')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save Member' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ portionFactor: 0.25 }), null)
  })

  it('stops at 3', async () => {
    render(<MemberEditor open users={users} member={{ ...sam, portionFactor: 2.75 }} onSave={() => {}} onClose={() => {}} />)
    const up = screen.getByRole('button', { name: 'Increase Portion Factor' })
    await userEvent.click(up)
    expect(up).toBeDisabled()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('needs a name', async () => {
    const onSave = vi.fn()
    render(<MemberEditor open users={users} onSave={onSave} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save Member' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/name/i)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('edits an existing Member, with colour, avatar and a linked User', async () => {
    const onSave = vi.fn()
    render(<MemberEditor open users={users} member={sam} onSave={onSave} onClose={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Edit Member' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Sam')
    expect(screen.getByLabelText('Avatar (optional)')).toHaveValue('🦊')
    expect(screen.getByLabelText('Colour')).toHaveValue('#81b29a')
    fireEvent.change(screen.getByLabelText('Colour'), { target: { value: '#112233' } })
    await userEvent.selectOptions(screen.getByLabelText('Linked User'), 'Cook')
    await userEvent.click(screen.getByRole('button', { name: 'Save Member' }))
    expect(onSave).toHaveBeenCalledWith({ name: 'Sam', colour: '#112233', avatar: '🦊', portionFactor: 0.5 }, 2)
  })

  it('preselects the linked User and can unlink', async () => {
    const onSave = vi.fn()
    render(<MemberEditor open users={users} member={{ ...sam, userId: 2 }} onSave={onSave} onClose={() => {}} />)
    expect(screen.getByLabelText('Linked User')).toHaveDisplayValue('Cook')
    await userEvent.selectOptions(screen.getByLabelText('Linked User'), 'No linked User')
    await userEvent.click(screen.getByRole('button', { name: 'Save Member' }))
    expect(onSave).toHaveBeenCalledWith(expect.anything(), null)
  })

  it('removes a Member only when editing one', async () => {
    const onDelete = vi.fn()
    const { rerender } = render(<MemberEditor open users={users} onSave={() => {}} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Remove Member' })).toBeNull()
    rerender(<MemberEditor open users={users} member={sam} onDelete={onDelete} onSave={() => {}} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove Member' }))
    expect(onDelete).toHaveBeenCalled()
  })

  it('shows a server error', () => {
    render(<MemberEditor open users={users} member={sam} error="That User is already linked to another Member." onSave={() => {}} onClose={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/already linked/)
  })
})

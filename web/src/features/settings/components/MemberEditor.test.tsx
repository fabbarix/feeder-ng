import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { openOptionNames, pickOption } from '../test-utils'
import { anna, marco, sam } from './fixtures'
import { MemberEditor } from './MemberEditor'

const users = [
  { id: 1, displayName: 'Admin', email: 'admin@example.test' },
  { id: 2, displayName: 'Cook', email: 'cook@example.test' },
  { id: 3, displayName: 'Guest', email: 'guest@example.test' },
]
// anna is linked to User 2 (Cook), marco and sam to nobody.
const all = [anna, marco, sam]

describe('MemberEditor', () => {
  it('renders nothing when closed', () => {
    render(<MemberEditor open={false} users={users} members={all} onSave={() => {}} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('has no native control: no <select>, no colour or number input', () => {
    render(<MemberEditor open users={users} members={all} onSave={() => {}} onClose={() => {}} />)
    expect(document.querySelector('select, input[type=color], input[type=number]')).toBeNull()
  })

  it('adds a Member starting at Portion Factor 1 with a preset colour', async () => {
    const onSave = vi.fn()
    render(<MemberEditor open users={users} members={all} onSave={onSave} onClose={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Add Member' })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Name'), 'Nonna')
    await userEvent.click(screen.getByRole('button', { name: 'Save Member' }))
    expect(onSave).toHaveBeenCalledWith({ name: 'Nonna', colour: expect.stringMatching(/^#[0-9a-f]{6}$/i), avatar: '', portionFactor: 1, email: null }, null)
  })

  it('picks the Member colour from named swatches, with Custom, and shows the current one', async () => {
    const onSave = vi.fn()
    render(<MemberEditor open users={users} members={all} member={sam} onSave={onSave} onClose={() => {}} />)
    const group = screen.getByRole('radiogroup', { name: 'Colour' })
    expect(within(group).getByRole('radio', { name: 'Sage' })).toHaveAttribute('aria-checked', 'true')
    expect(within(group).getByRole('radio', { name: 'Custom' })).toBeInTheDocument()
    await userEvent.click(within(group).getByRole('radio', { name: 'Terracotta' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Member' }))
    expect(onSave.mock.calls[0]![0].colour).toBe('#e07a5f')
  })

  it('steps the Portion Factor by 0.25 within 0.25..3', async () => {
    const onSave = vi.fn()
    render(<MemberEditor open users={users} members={all} onSave={onSave} onClose={() => {}} />)
    await userEvent.type(screen.getByLabelText('Name'), 'Sam')
    const down = screen.getByRole('button', { name: 'Decrease Portion Factor' })
    await userEvent.click(down)
    await userEvent.click(down)
    await userEvent.click(down)
    await userEvent.click(down)
    expect(down).toBeDisabled()
    expect(screen.getByRole('spinbutton', { name: 'Portion Factor' })).toHaveAttribute('aria-valuenow', '0.25')
    await userEvent.click(screen.getByRole('button', { name: 'Save Member' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ portionFactor: 0.25 }), null)
  })

  it('needs a name', async () => {
    const onSave = vi.fn()
    render(<MemberEditor open users={users} members={all} onSave={onSave} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save Member' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/name/i)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('does not offer a User who is already linked to another Member (QA)', async () => {
    render(<MemberEditor open users={users} members={all} member={sam} onSave={() => {}} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('combobox', { name: /Linked User/ }))
    const names = openOptionNames()
    expect(names).toContain('No linked User')
    expect(names).toContain('Admin')
    expect(names).toContain('Guest')
    expect(names).not.toContain('Cook')
  })

  it('keeps the Member\'s own linked User in the list, preselected, and can unlink', async () => {
    const onSave = vi.fn()
    render(<MemberEditor open users={users} members={all} member={anna} onSave={onSave} onClose={() => {}} />)
    expect(screen.getByRole('combobox', { name: /Linked User/ })).toHaveTextContent('Cook')
    await pickOption(/Linked User/, 'No linked User')
    await userEvent.click(screen.getByRole('button', { name: 'Save Member' }))
    expect(onSave).toHaveBeenCalledWith(expect.anything(), null)
  })

  it('links a free User', async () => {
    const onSave = vi.fn()
    render(<MemberEditor open users={users} members={all} member={sam} onSave={onSave} onClose={() => {}} />)
    await pickOption(/Linked User/, 'Guest')
    await userEvent.click(screen.getByRole('button', { name: 'Save Member' }))
    expect(onSave).toHaveBeenCalledWith({ name: 'Sam', colour: sam.colour, avatar: '🦊', portionFactor: 0.5, email: null }, 3)
  })

  it('removes a Member only when editing one', async () => {
    const onDelete = vi.fn()
    const { rerender } = render(<MemberEditor open users={users} members={all} onSave={() => {}} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Remove Member' })).toBeNull()
    rerender(<MemberEditor open users={users} members={all} member={sam} onDelete={onDelete} onSave={() => {}} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove Member' }))
    expect(onDelete).toHaveBeenCalled()
  })

  it('shows a server error', () => {
    render(<MemberEditor open users={users} members={all} member={sam} error="That User is already linked to another Member." onSave={() => {}} onClose={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/already linked/)
  })
})

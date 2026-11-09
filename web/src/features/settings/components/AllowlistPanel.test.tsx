import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { admin, cook } from './fixtures'
import { AllowlistPanel } from './AllowlistPanel'

function setup(over: Partial<React.ComponentProps<typeof AllowlistPanel>> = {}) {
  const props = {
    users: [admin, cook], currentUserId: 1,
    onAdd: vi.fn().mockResolvedValue(undefined), onSetAdmin: vi.fn(), onRemove: vi.fn(), ...over,
  }
  render(<AllowlistPanel {...props} />)
  return props
}

describe('AllowlistPanel', () => {
  it('lists everyone allowed to sign in and marks you', () => {
    setup()
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]!).getByText('admin@example.test')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('(you)')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Admin: admin@example.test' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Admin: cook@example.test' })).not.toBeChecked()
  })

  it('adds an email and clears the field', async () => {
    const { onAdd } = setup()
    const input = screen.getByLabelText('Email to allow')
    await userEvent.type(input, 'nonna@example.test')
    await userEvent.click(screen.getByRole('button', { name: 'Add to allowlist' }))
    expect(onAdd).toHaveBeenCalledWith('nonna@example.test')
    await vi.waitFor(() => expect(input).toHaveValue(''))
  })

  it('keeps the text when adding fails', async () => {
    const onAdd = vi.fn().mockRejectedValue(new Error('taken'))
    setup({ onAdd })
    const input = screen.getByLabelText('Email to allow')
    await userEvent.type(input, 'cook@example.test')
    await userEvent.click(screen.getByRole('button', { name: 'Add to allowlist' }))
    expect(onAdd).toHaveBeenCalled()
    expect(input).toHaveValue('cook@example.test')
  })

  it('rejects something that is not an email without calling out', async () => {
    const { onAdd } = setup()
    await userEvent.type(screen.getByLabelText('Email to allow'), 'nonna')
    await userEvent.click(screen.getByRole('button', { name: 'Add to allowlist' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/email/i)
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('makes someone an Admin', async () => {
    const { onSetAdmin } = setup()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Admin: cook@example.test' }))
    expect(onSetAdmin).toHaveBeenCalledWith(2, true)
  })

  it('removes a User only after confirming', async () => {
    const { onRemove } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Remove cook@example.test' }))
    expect(onRemove).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm remove cook@example.test' }))
    expect(onRemove).toHaveBeenCalledWith(2)
  })

  it('can back out of a removal', async () => {
    const { onRemove } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Remove cook@example.test' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('button', { name: 'Confirm remove cook@example.test' })).toBeNull()
    expect(onRemove).not.toHaveBeenCalled()
  })

  it('locks the only Admin', () => {
    setup()
    expect(screen.getByRole('checkbox', { name: 'Admin: admin@example.test' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove admin@example.test' })).toBeDisabled()
    expect(screen.getByText('Last Admin')).toBeInTheDocument()
  })

  it('unlocks Admins when there are two', () => {
    setup({ users: [admin, { ...cook, isAdmin: true }] })
    expect(screen.getByRole('checkbox', { name: 'Admin: admin@example.test' })).toBeEnabled()
    expect(screen.queryByText('Last Admin')).toBeNull()
  })

  it('shows a server error', () => {
    setup({ error: 'There must always be at least one Admin.' })
    expect(screen.getByRole('alert')).toHaveTextContent(/at least one Admin/)
  })
})

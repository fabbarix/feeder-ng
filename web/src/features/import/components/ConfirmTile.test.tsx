import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { importStrings as s } from '../strings'
import { ConfirmTile } from './ConfirmTile'

describe('ConfirmTile', () => {
  it('confirms when ready', async () => {
    const onConfirm = vi.fn()
    render(<ConfirmTile canConfirm busy={false} open={0} onConfirm={onConfirm} />)
    await userEvent.click(screen.getByRole('button', { name: s.confirm }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })
  it('is disabled and says how much is left while answers are missing', () => {
    render(<ConfirmTile canConfirm={false} busy={false} open={3} onConfirm={vi.fn()} />)
    expect(screen.getByRole('button', { name: s.confirm })).toBeDisabled()
    expect(screen.getByText(s.confirmOpen(3))).toBeInTheDocument()
  })
  it('shows progress while saving', () => {
    render(<ConfirmTile canConfirm={false} busy open={0} onConfirm={vi.fn()} />)
    expect(screen.getByRole('button', { name: s.confirming })).toBeDisabled()
  })
})

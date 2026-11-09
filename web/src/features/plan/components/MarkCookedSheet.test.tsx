import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { meal } from '../test-utils'
import type { CookPreview } from '../types'
import { MarkCookedSheet } from './MarkCookedSheet'

const preview: CookPreview = {
  meal: meal({ recipeName: 'Chicken', batches: 1 }), fresh: true, batches: 1, yield: 4, portionsNeeded: 2,
  proposedLeftover: 2, maxLeftover: 4, leftoverUseBy: '2026-11-12', needs: [],
}

function setup(over: Partial<React.ComponentProps<typeof MarkCookedSheet>> = {}) {
  const h = { onClose: vi.fn(), onLeftoverChange: vi.fn(), onConfirm: vi.fn(), onNotCooked: vi.fn() }
  render(<MarkCookedSheet open preview={preview} isLoading={false} leftover={2} busy={false} error={null} {...h} {...over} />)
  return h
}

describe('MarkCookedSheet', () => {
  it('shows the Recipe, what the Batches make against what is needed, and the proposed Leftover with its Use-by', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Mark as Cooked' })).toBeInTheDocument()
    expect(screen.getByText('Chicken')).toBeInTheDocument()
    expect(screen.getByText(/1 Batch makes 4 portions/)).toBeInTheDocument()
    expect(screen.getByText(/2 portions needed/)).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument() // the Stepper value
    expect(screen.getByText('Use by Thursday')).toBeInTheDocument()
  })

  it('the ± control moves the Leftover in half portions', async () => {
    const h = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Increase Leftover portions' }))
    expect(h.onLeftoverChange).toHaveBeenCalledWith(2.5)
    await userEvent.click(screen.getByRole('button', { name: 'Decrease Leftover portions' }))
    expect(h.onLeftoverChange).toHaveBeenCalledWith(1.5)
  })

  it('cannot go below none or above Batches x Yield', () => {
    setup({ leftover: 4 })
    expect(screen.getByRole('button', { name: 'Increase Leftover portions' })).toBeDisabled()
  })

  it('no Leftover says so instead of a Use-by', () => {
    setup({ leftover: 0 })
    expect(screen.getByRole('button', { name: 'Decrease Leftover portions' })).toBeDisabled()
    expect(screen.getByText('No Leftover')).toBeInTheDocument()
    expect(screen.queryByText(/Use by/)).not.toBeInTheDocument()
  })

  it('a meal served from a Leftover has no stepper', () => {
    setup({ preview: { ...preview, fresh: false, batches: 0, proposedLeftover: 0, maxLeftover: 0 } })
    expect(screen.queryByRole('button', { name: /Leftover portions/ })).not.toBeInTheDocument()
  })

  it('confirming and "Not cooked" report to the caller', async () => {
    const h = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Mark as Cooked' }))
    expect(h.onConfirm).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Not cooked' }))
    expect(h.onNotCooked).toHaveBeenCalledTimes(1)
  })

  it('shows a save error and disables the buttons while busy', () => {
    setup({ error: 'That could not be saved. Nothing was changed.', busy: true })
    expect(screen.getByRole('alert')).toHaveTextContent('That could not be saved. Nothing was changed.')
    expect(screen.getByRole('button', { name: 'Mark as Cooked' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Not cooked' })).toBeDisabled()
  })
})

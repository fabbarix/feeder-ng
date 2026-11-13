// CRS F (spec 8): Mark all Cooked: one sheet with each fresh Course's proposed Leftover (± each), confirmed together.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AllCookedRow } from '../lib/toConfirm'
import { noUsedFrom } from '../test-utils'
import { MarkAllCookedSheet, type MarkAllCookedSheetProps } from './MarkAllCookedSheet'

const rows: AllCookedRow[] = [
  { courseId: 1, courseName: 'Main', recipeName: 'Roast chicken', fresh: true, proposedLeftover: 2, maxLeftover: 4, leftover: 2, leftoverUseBy: '2026-11-13' },
  { courseId: 2, courseName: 'Side', recipeName: 'Green beans', fresh: true, proposedLeftover: 1, maxLeftover: 2, leftover: 1, leftoverUseBy: '2026-11-13' },
  { courseId: 3, courseName: 'Dessert', recipeName: 'Tiramisu', fresh: false, proposedLeftover: 0, maxLeftover: 0, leftover: 0, leftoverUseBy: '2026-11-13' },
]

function setup(over: Partial<MarkAllCookedSheetProps> = {}) {
  const h = { onClose: vi.fn(), onLeftoverChange: vi.fn(), onConfirm: vi.fn() }
  render(<MarkAllCookedSheet open rows={rows} isLoading={false} busy={false} error={null} usedFrom={noUsedFrom()} {...h} {...over} />)
  return h
}

describe('MarkAllCookedSheet', () => {
  it('is a dialog named Mark all Cooked with a block per Course: its name and Recipe', () => {
    setup()
    const sheet = screen.getByRole('dialog', { name: 'Mark all Cooked' })
    for (const text of ['Main', 'Roast chicken', 'Side', 'Green beans', 'Dessert', 'Tiramisu']) expect(within(sheet).getByText(text)).toBeInTheDocument()
  })

  it('a fresh Course has its own Leftover spinbutton at its proposal, with a ± control', async () => {
    const h = setup()
    expect(screen.getByRole('spinbutton', { name: 'Main Leftover portions' })).toHaveAttribute('aria-valuenow', '2')
    expect(screen.getByRole('spinbutton', { name: 'Side Leftover portions' })).toHaveAttribute('aria-valuenow', '1')
    await userEvent.click(screen.getByRole('button', { name: 'Increase Main Leftover portions' }))
    expect(h.onLeftoverChange).toHaveBeenCalledWith(1, 2.5)
    await userEvent.click(screen.getByRole('button', { name: 'Decrease Side Leftover portions' }))
    expect(h.onLeftoverChange).toHaveBeenCalledWith(2, 0.5)
  })

  it('a Leftover Course has no field and says nothing is taken from Stock', () => {
    setup()
    expect(screen.queryByRole('spinbutton', { name: 'Dessert Leftover portions' })).not.toBeInTheDocument()
    expect(screen.getByText('Served from a Leftover. Nothing is taken from Stock.')).toBeInTheDocument()
  })

  it('has one primary button, Mark all Cooked, in the footer', async () => {
    const h = setup()
    const footer = document.querySelector('.sheet__footer') as HTMLElement
    const confirm = within(footer).getByRole('button', { name: 'Mark all Cooked' })
    expect(confirm).toHaveAttribute('data-variant', 'primary')
    await userEvent.click(confirm)
    expect(h.onConfirm).toHaveBeenCalledTimes(1)
  })

  it('shows an error as an alert and disables the button while busy', () => {
    setup({ error: 'That could not be saved. Nothing was changed.', busy: true })
    expect(screen.getByRole('alert')).toHaveTextContent('Nothing was changed')
    expect(within(document.querySelector('.sheet__footer') as HTMLElement).getByRole('button', { name: 'Mark all Cooked' })).toBeDisabled()
  })

  it('says it is loading and cannot be confirmed before the rows are there', () => {
    setup({ rows: [], isLoading: true })
    expect(screen.getByText('Loading the plan…')).toBeInTheDocument()
    expect(within(document.querySelector('.sheet__footer') as HTMLElement).getByRole('button', { name: 'Mark all Cooked' })).toBeDisabled()
  })
})

// b5-ufw (docs/dev/design/b5-ufw.md §5): the Used from section sits below the Leftover stepper of Mark as Cooked.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CookPreviewWithLots } from '../api.usedFrom'
import { useUsedFrom } from '../hooks/useUsedFrom'
import { meal } from '../test-utils'
import { MarkCookedSheet } from './MarkCookedSheet'

const lot = (id: number, quantity: number, place: string) => ({ id, quantity, purchased: '2026-11-09', goesOff: '2026-11-14', storagePlaceName: place })
const preview: CookPreviewWithLots = {
  meal: meal({ recipeName: 'Roast chicken', courseId: 1, courseName: 'Main' }), fresh: true, batches: 1, yield: 4, portionsNeeded: 2,
  proposedLeftover: 2, maxLeftover: 4, leftoverUseBy: '2026-11-13',
  needs: [{ ingredientId: 11, ingredient: 'Chicken thighs', quantity: 800, baseUnit: 'g', lots: [lot(1, 500, 'Fridge'), lot(2, 600, 'Freezer')] }],
}

/** The real controller over the preview, as useMarkCooked builds it. */
function Harness({ pv = preview }: { pv?: CookPreviewWithLots }) {
  const usedFrom = useUsedFrom([{ courseId: 1, courseName: 'Main', needs: pv.needs }], { unitSystem: 'metric', today: '2026-11-10' })
  return (
    <MarkCookedSheet
      open preview={pv} isLoading={false} leftover={2} busy={false} error={null} usedFrom={usedFrom}
      onClose={vi.fn()} onLeftoverChange={vi.fn()} onConfirm={vi.fn()} onNotCooked={vi.fn()}
    />
  )
}

describe('MarkCookedSheet: Used from', () => {
  it('shows a collapsed Used from row with the default summary', () => {
    render(<Harness />)
    const row = screen.getByRole('button', { name: /Used from/ })
    expect(row).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Soonest to go off first')).toBeInTheDocument()
  })

  it('sits below the Leftover stepper', () => {
    render(<Harness />)
    const stepper = screen.getByRole('spinbutton', { name: 'Leftover portions' })
    const row = screen.getByRole('button', { name: /Used from/ })
    expect(stepper.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('expands to the Stock Lots; ticking one prefills its amount and updates the summary', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: /Used from/ }))
    expect(screen.getByText('Chicken thighs · 800 g')).toBeVisible()
    await userEvent.click(screen.getByRole('checkbox', { name: /500 g · Fridge/ }))
    expect(screen.getByRole('spinbutton', { name: 'Amount used from Fridge' })).toHaveAttribute('aria-valuenow', '500')
    expect(screen.getByText('Your choice for 1 Ingredient')).toBeInTheDocument()
  })

  it('a Leftover meal (nothing taken from Stock) has no Used from row', () => {
    render(<Harness pv={{ ...preview, fresh: false, batches: 0, proposedLeftover: 0, maxLeftover: 0, needs: [] }} />)
    expect(screen.queryByRole('button', { name: /Used from/ })).not.toBeInTheDocument()
  })

  it('without a controller the sheet is as before', () => {
    render(<MarkCookedSheet open preview={preview} isLoading={false} leftover={2} busy={false} error={null} onClose={vi.fn()} onLeftoverChange={vi.fn()} onConfirm={vi.fn()} onNotCooked={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Used from/ })).not.toBeInTheDocument()
  })
})

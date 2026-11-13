// b5-ufw (docs/dev/design/b5-ufw.md §5): one Used from section per fresh Course; a conflict disables Mark all Cooked.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { useUsedFrom } from '../hooks/useUsedFrom'
import type { AllCookedRow } from '../lib/toConfirm'
import type { UsedFromNeed } from '../lib/usedFrom'
import { MarkAllCookedSheet } from './MarkAllCookedSheet'

const lot = (id: number, quantity: number, place: string) => ({ id, quantity, purchased: '2026-11-09', goesOff: '2026-11-14', storagePlaceName: place })
const chicken: UsedFromNeed = { ingredientId: 11, ingredient: 'Chicken thighs', quantity: 400, baseUnit: 'g', lots: [lot(1, 500, 'Fridge')] }
const rows: AllCookedRow[] = [
  { courseId: 1, courseName: 'Main', recipeName: 'Roast chicken', fresh: true, proposedLeftover: 2, maxLeftover: 4, leftover: 2, leftoverUseBy: '2026-11-13' },
  { courseId: 2, courseName: 'Side', recipeName: 'Green beans', fresh: true, proposedLeftover: 1, maxLeftover: 2, leftover: 1, leftoverUseBy: '2026-11-13' },
  { courseId: 3, courseName: 'Dessert', recipeName: 'Tiramisu', fresh: false, proposedLeftover: 0, maxLeftover: 0, leftover: 0, leftoverUseBy: '2026-11-13' },
]
const courses = [
  { courseId: 1, courseName: 'Main', needs: [chicken] },
  { courseId: 2, courseName: 'Side', needs: [chicken] },
  { courseId: 3, courseName: 'Dessert', needs: [] },
]

function Harness({ onConfirm = vi.fn() }: { onConfirm?: () => void }) {
  const usedFrom = useUsedFrom(courses, { unitSystem: 'metric', today: '2026-11-10' })
  return (
    <MarkAllCookedSheet
      open rows={rows} isLoading={false} busy={false} error={null} usedFrom={usedFrom}
      onClose={vi.fn()} onLeftoverChange={vi.fn()} onConfirm={onConfirm}
    />
  )
}

const sectionOf = (name: string) => screen.getByText(name).closest('section') as HTMLElement

describe('MarkAllCookedSheet: Used from', () => {
  it('has a Used from row inside each fresh Course, below its Leftover field, and none for a Leftover Course', () => {
    render(<Harness />)
    for (const name of ['Main', 'Side']) {
      const section = sectionOf(name)
      const row = within(section).getByRole('button', { name: /Used from/ })
      const field = within(section).getByRole('spinbutton', { name: `${name} Leftover portions` })
      expect(field.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(within(sectionOf('Dessert')).queryByRole('button', { name: /Used from/ })).not.toBeInTheDocument()
  })

  it('picks are per Course: ticking in Main leaves Side on the default', async () => {
    render(<Harness />)
    await userEvent.click(within(sectionOf('Main')).getByRole('button', { name: /Used from/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /500 g · Fridge/ }))
    expect(within(sectionOf('Main')).getByText('Your choice for 1 Ingredient')).toBeInTheDocument()
    expect(within(sectionOf('Side')).getByText('Soonest to go off first')).toBeInTheDocument()
  })

  it('two Courses taking more from one Lot than it holds show the conflict and disable Mark all Cooked', async () => {
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} />)
    const confirm = screen.getByRole('button', { name: 'Mark all Cooked' })
    expect(confirm).toBeEnabled()
    for (const name of ['Main', 'Side']) {
      await userEvent.click(within(sectionOf(name)).getByRole('button', { name: /Used from/ }))
      await userEvent.click(within(sectionOf(name)).getByRole('checkbox', { name: /500 g · Fridge/ }))
    }
    // 400 + 400 g against a 500 g Lot.
    expect(screen.getAllByText(/Chicken thighs: the Courses together take more from the 500 g Lot in Fridge than it holds/).length).toBeGreaterThan(0)
    expect(confirm).toBeDisabled()
    await userEvent.click(confirm)
    expect(onConfirm).not.toHaveBeenCalled()
    await userEvent.click(within(sectionOf('Side')).getByRole('checkbox', { name: /500 g · Fridge/ }))
    expect(confirm).toBeEnabled()
  })

  it('without a controller the sheet is as before', () => {
    render(<MarkAllCookedSheet open rows={rows} isLoading={false} busy={false} error={null} onClose={vi.fn()} onLeftoverChange={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Used from/ })).not.toBeInTheDocument()
  })
})

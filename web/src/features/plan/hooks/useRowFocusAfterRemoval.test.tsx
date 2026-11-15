// B9-39 (B9-26 ruling 9) developer: the To confirm row went while focus was still in the menu sheet its ⋮ opened (Not cooked on a phone);
// when the sheet closes and focus is lost, it goes to the row that took the gone row's place.
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { courseMeal, planCourse, slot } from '../test-utils'
import type { PlanEntry } from '../types'
import { ToConfirmTile } from '../components/TodayTiles'

const entry = (mealSlotId: number, name: string, recipe: string): PlanEntry =>
  slot({
    date: '2026-11-09', mealSlotId, name, time: '13:00', at: '2026-11-09T13:00:00Z', courseId: 1, courseName: 'Main',
    meal: courseMeal(1, 'Main', { recipeName: recipe, mealSlotId, date: '2026-11-09' }), courses: [planCourse({ courseId: 1, name: 'Main', main: true })],
  })
const h = { onYesCooked: vi.fn(), onAdjust: vi.fn(), onNotCooked: vi.fn() }

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('focus after a row goes while its menu sheet is open', () => {
  // The sheet is a portal of the row's ⋮ in the real app: React bubbles its focus through the list, which must not forget the row.
  it('focus in a portal rendered from inside a row does not make the list forget the row', async () => {
    const { createPortal } = await import('react-dom')
    const { useRowFocusAfterRemoval } = await import('./useRowFocusAfterRemoval')
    function List({ keys, open }: { keys: string[]; open: string | null }) {
      const focus = useRowFocusAfterRemoval(keys)
      return (
        <ul onFocus={focus.onFocus}>
          {keys.map((k) => (
            <li key={k} data-row-focus-key={k}>
              <button type="button">Cooked {k}</button>
              {open === k ? createPortal(<dialog open><button type="button">Not cooked</button></dialog>, document.body) : null}
            </li>
          ))}
        </ul>
      )
    }
    const { rerender } = render(<List keys={['a', 'b']} open={null} />)
    act(() => screen.getByRole('button', { name: 'Cooked a' }).focus())
    rerender(<List keys={['a', 'b']} open="a" />)
    act(() => screen.getByRole('button', { name: 'Not cooked' }).focus())
    rerender(<List keys={['b']} open={null} />)
    act(() => void vi.advanceTimersByTime(100))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cooked b' }))
  })

  function sheetWithFocus() {
    const dialog = document.createElement('dialog')
    dialog.setAttribute('open', '')
    const item = document.createElement('button')
    item.textContent = 'Not cooked'
    dialog.append(item)
    document.body.append(dialog)
    act(() => item.focus())
    return dialog
  }

  it('moves to the next row once the sheet has closed and focus is lost', () => {
    const { rerender } = render(<ToConfirmTile slots={[entry(1, 'Breakfast', 'Porridge'), entry(2, 'Lunch', 'Lentil soup')]} {...h} />)
    act(() => screen.getByRole('button', { name: 'More for Mon Breakfast' }).focus())
    const dialog = sheetWithFocus()
    rerender(<ToConfirmTile slots={[entry(2, 'Lunch', 'Lentil soup')]} {...h} />)
    expect(document.activeElement).toBe(dialog.querySelector('button'))
    act(() => dialog.remove())
    act(() => void vi.advanceTimersByTime(100))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Cooked Lentil soup, / }))
  })

  it('leaves focus alone when it went somewhere else when the sheet closed', () => {
    const { rerender } = render(
      <>
        <button type="button">Elsewhere</button>
        <ToConfirmTile slots={[entry(1, 'Breakfast', 'Porridge'), entry(2, 'Lunch', 'Lentil soup')]} {...h} />
      </>,
    )
    act(() => screen.getByRole('button', { name: 'More for Mon Breakfast' }).focus())
    const dialog = sheetWithFocus()
    rerender(
      <>
        <button type="button">Elsewhere</button>
        <ToConfirmTile slots={[entry(2, 'Lunch', 'Lentil soup')]} {...h} />
      </>,
    )
    act(() => dialog.remove())
    act(() => screen.getByRole('button', { name: 'Elsewhere' }).focus())
    act(() => void vi.advanceTimersByTime(2000))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Elsewhere' }))
  })
})

// B9-32: the stable focus target of a Course row. TEST-AUTHOR tests; rowKey and focusPlanRow are stubs that throw.
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { focusPlanRow, rowKey } from './rowFocus'

const key = { date: '2026-11-17', mealSlotId: 1, courseId: 2 }

describe('rowKey', () => {
  it('is date/slot/course, the same string the row carries as data-row-key', () => {
    expect(rowKey(key)).toBe('2026-11-17/1/2')
  })
})

describe('focusPlanRow', () => {
  it("focuses the row's target button (not the Swap or Pin button next to it) and says so", () => {
    const { getByRole } = render(
      <ul>
        <li data-row-key="2026-11-17/1/2">
          <button type="button" className="list-row__target">Pancakes</button>
          <button type="button">Swap</button>
        </li>
        <li data-row-key="2026-11-17/1/3">
          <button type="button" className="list-row__target">Other</button>
        </li>
      </ul>,
    )
    expect(focusPlanRow(key)).toBe(true)
    expect(getByRole('button', { name: 'Pancakes' })).toHaveFocus()
  })

  it('says false and moves nothing when the row is not on the screen', () => {
    render(<button type="button">Other</button>)
    expect(focusPlanRow(key)).toBe(false)
  })
})

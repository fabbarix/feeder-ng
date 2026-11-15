// B9-32 (PC-11 option B, decision PC 2): the week grid is a container the Plan measures, twelve tracks, and each day's span comes from
// usePlanGrid. It replaces the old "BentoGrid min=day with no column count" test (ds-plan option B is reversed by the user's review).
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PlanGrid } from './PlanGrid'
import { installResizeObserver } from '../test-utils.grid'
import type { PlanGridLayout } from '../hooks/usePlanGrid'

let ro: ReturnType<typeof installResizeObserver>
beforeEach(() => {
  ro = installResizeObserver()
})
afterEach(() => ro.restore())

let seen: PlanGridLayout[] = []
const week = (count = 7) =>
  render(
    <PlanGrid count={count}>
      {(layout) => {
        seen.push(layout)
        return Array.from({ length: count }, (_, i) => (
          <article key={i} className="plan-day" data-testid={`day-${i}`} style={{ gridColumn: `span ${layout.spans[i]}` }} data-row={layout.rows[i] ? 'true' : undefined} />
        ))
      }}
    </PlanGrid>,
  )

describe('PlanGrid', () => {
  beforeEach(() => {
    seen = []
  })

  it('is a labelled group "Plan" that is a BentoGrid, inside a measured container (.plan-grid) that carries the column count', () => {
    week()
    const grid = screen.getByRole('group', { name: 'Plan' })
    expect(grid).toHaveClass('bento-grid')
    const container = grid.parentElement!
    expect(container).toHaveClass('plan-grid')
    expect(container).toHaveAttribute('data-columns', '1')
    expect(ro.observers[0]!.targets).toEqual([container])
  })

  it('hands its children the layout of the week: one column and twelve-track spans until measured', () => {
    week()
    expect(seen.at(-1)).toMatchObject({ columns: 1, spans: [12, 12, 12, 12, 12, 12, 12] })
  })

  it('at 820 (a 772 px container) it has 2 columns and Saturday has the whole row', () => {
    week()
    act(() => ro.fire(772))
    expect(screen.getByRole('group', { name: 'Plan' }).parentElement).toHaveAttribute('data-columns', '2')
    expect(screen.getByTestId('day-0').style.gridColumn).toBe('span 6')
    expect(screen.getByTestId('day-6').style.gridColumn).toBe('span 12')
    expect(screen.getByTestId('day-6')).toHaveAttribute('data-row', 'true')
    expect(screen.getByTestId('day-5')).not.toHaveAttribute('data-row')
  })

  it('at 1920 (a 1480 px container) it has 4 columns and Thu, Fri and Sat share the last row, 4 tracks each', () => {
    week()
    act(() => ro.fire(1480))
    expect(screen.getByRole('group', { name: 'Plan' }).parentElement).toHaveAttribute('data-columns', '4')
    const spans = [0, 1, 2, 3, 4, 5, 6].map((i) => screen.getByTestId(`day-${i}`).style.gridColumn)
    expect(spans).toEqual(['span 3', 'span 3', 'span 3', 'span 3', 'span 4', 'span 4', 'span 4'])
  })

  it('keeps its children in DOM order (reading order is unchanged by the layout)', () => {
    week()
    act(() => ro.fire(1480))
    const ids = [...screen.getByRole('group', { name: 'Plan' }).querySelectorAll('article')].map((a) => a.getAttribute('data-testid'))
    expect(ids).toEqual(['day-0', 'day-1', 'day-2', 'day-3', 'day-4', 'day-5', 'day-6'])
  })
})

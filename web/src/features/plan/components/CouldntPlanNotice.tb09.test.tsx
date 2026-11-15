// B9-44 (TB-09): Couldn't plan uses the shared TileHeader: an info badge (the DS cause icon), the title "Couldn't plan" as the h2 that names the
// section, a count of the causes, and "Show which meals" (secondary, small) as the header's action. No overline.
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { EXCLUDED, NO_COURSE_RECIPES, WEEK, dinner, empty, planned } from '../couldnt-fixtures'
import { useCouldntPlanNotice } from '../hooks/useCouldntPlanNotice'
import { courseCells, unplannedOf } from '../lib/couldntGroups'
import type { PlanSlot } from '../types'
import { CouldntPlanNotice } from './CouldntPlanNotice'

function Notice({ slots }: { slots: PlanSlot[] }) {
  const notice = useCouldntPlanNotice(unplannedOf(courseCells(slots)), courseCells(slots), true)
  return <CouldntPlanNotice groups={notice.groups} onFix={() => {}} onShowMeals={() => {}} />
}
const both = WEEK.map((d, i) => dinner(d, [planned(1, 'Main'), ...(i < 4 ? [empty(2, 'Side', EXCLUDED)] : []), empty(3, 'Dessert', NO_COURSE_RECIPES)]))
const view = () => render(<MemoryRouter><Notice slots={both} /></MemoryRouter>)

describe('CouldntPlanNotice: the TileHeader (TB-09)', () => {
  it('has exactly one .tile-header, whose h2 names the section', () => {
    const { container } = view()
    expect(container.querySelectorAll('.tile-header')).toHaveLength(1)
    const tile = screen.getByRole('region', { name: "Couldn't plan" })
    const h2 = within(tile).getByRole('heading', { level: 2, name: "Couldn't plan" })
    expect(tile).toHaveAttribute('aria-labelledby', h2.id)
    expect(container.querySelector('.tile__overline')).toBeNull()
  })

  it('counts the causes, with an info badge (the tile is info; a cause icon stays on each row)', () => {
    const { container } = view()
    expect(container.querySelector('.tile-header .chip[data-kind="count"]')).toHaveTextContent('2')
    expect(container.querySelector('.tile-header__badge')).toHaveAttribute('data-tone', 'info')
  })

  it('has "Show which meals" in the header’s action slot, a secondary small button, and no tertiary button anywhere in the tile', () => {
    const { container } = view()
    const b = screen.getByRole('button', { name: 'Show which meals' })
    expect(b.closest('.tile-header__action')).not.toBeNull()
    expect(b).toHaveAttribute('data-variant', 'secondary')
    expect(container.querySelector('[data-variant="tertiary"]')).toBeNull()
  })

  it('the old .couldnt-head row is gone', () => {
    const { container } = view()
    expect(container.querySelector('.couldnt-head')).toBeNull()
  })
})

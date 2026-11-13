// B5-BOW round 2 (ADR 0013): Today matches Plan. The hero shows the Bought chip and the hard-rule warn line.
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { courseMeal, courseSlot, favourite, meal, planCourse, slot } from '../test-utils'
import type { BoughtInfo, MealWarning } from '../lib/bought'
import type { PlanSlot } from '../types'
import { TonightHero } from './TonightHero'

const upcoming = new Date('2026-11-10T17:00:00Z')
const bought: BoughtInfo = { ingredients: [{ id: 40, name: 'garlic' }, { id: 41, name: 'cream' }] }
const attendance = [{ id: 2, name: 'Sam' }]

function show(s: PlanSlot) {
  const h = {
    onCook: vi.fn(), onYesCooked: vi.fn(), onAdjust: vi.fn(), onMarkAllCooked: vi.fn(),
    rowHandlers: { onOpen: vi.fn(), onSwap: vi.fn(), onPin: vi.fn(), onUnpin: vi.fn(), onMarkCooked: vi.fn(), onChoose: vi.fn() },
    menu: { onNotCookedSlot: vi.fn(), onAddCourse: vi.fn() },
  }
  return render(
    <MemoryRouter>
      <TonightHero slot={s} now={upcoming} today="2026-11-10" {...h} />
    </MemoryRouter>,
  )
}
const dinner = (over = {}) => slot({ at: '2026-11-10T19:30:00Z', time: '19:30', attendance, meal: meal({ cookMinutes: 45, startBy: '18:45', ...over }) } as Partial<PlanSlot> & { meal: ReturnType<typeof meal> })

describe('TonightHero: Bought chip', () => {
  it('a Bought meal with no other chip shows the Bought chip', () => {
    show(dinner({ bought }))
    expect(screen.getByText('Bought')).toBeInTheDocument()
  })
  it('it takes a place of the two: Bought first, then the first why chip', () => {
    const { container } = show(dinner({ bought, why: [favourite('Anna'), { code: 'stock_coverage', ingredient: 'rice' }] }))
    const labels = [...container.querySelectorAll('.plan-hero__chips .chip')].map((c) => c.textContent)
    expect(labels).toEqual(['Bought', "Anna's favourite"])
  })
  it('a meal that is not Bought, or has an empty list, shows no Bought chip', () => {
    show(dinner({ bought: { ingredients: [] } }))
    expect(screen.queryByText('Bought')).not.toBeInTheDocument()
  })
})

describe('TonightHero: the hard-rule warn line (Bought or Pinned, as on the Plan sheet)', () => {
  const warn = (warning: MealWarning | null, over = {}) => {
    const view = show(dinner({ warning, ...over }))
    return view
  }
  it('excluded names the Member (Attendance) and the Ingredient (Bought list)', () => {
    warn({ code: 'excluded', memberId: 2, ingredientId: 40 }, { bought })
    expect(screen.getByRole('note')).toHaveTextContent('Sam now excludes garlic, which this uses. Swap it to change it.')
  })
  it('archived', () => {
    warn({ code: 'archived' }, { bought })
    expect(screen.getByRole('note')).toHaveTextContent('This Recipe is archived. Swap it to change it.')
  })
  it('no warning, no line', () => {
    warn(null, { bought })
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})

describe('TonightHero with several Courses', () => {
  const main = (over = {}) => planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main', { recipeName: 'Roast chicken', ...over }) })
  const side = (over = {}) => planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { recipeName: 'Green beans', ...over }) })
  const several = (courses: ReturnType<typeof planCourse>[]) =>
    courseSlot(courses, { name: 'Dinner', time: '19:00', at: '2026-11-10T19:00:00Z', cookMinutes: 30, startBy: '18:30', attendance } as Partial<PlanSlot>)

  it('the main Course hero shows the Bought chip and the warn line', () => {
    show(several([main({ bought, warning: { code: 'excluded', memberId: 2, ingredientId: 40 } }), side()]))
    expect(screen.getByText('Bought')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('Sam now excludes garlic, which this uses. Swap it to change it.')
  })
  it('a Side row in the block keeps the one-chip rule of Plan (no warn line)', () => {
    show(several([main(), side({ bought, warning: { code: 'archived' } })]))
    const row = screen.getByRole('listitem', { name: 'Side' })
    expect(within(row).getByText('Bought')).toBeInTheDocument()
    expect(within(row).queryByRole('note')).not.toBeInTheDocument()
  })
})

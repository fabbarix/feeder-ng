// SF-chips: a relaxed Variety chip names the Tag by its display name ("3rd Fish this week"), not its key, in all four
// components that render why chips. The Tag names come from GET /api/tags (useTags), not from the component.
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Tag } from '../../../lib/tags'
import { courseMeal, courseSlot, meal, mockApi, newQueryClient, planCourse, slot } from '../test-utils'
import type { PlanSlot, PlannedMeal } from '../types'
import { CourseRow } from './CourseRow'
import { MealTile } from './MealTile'
import { PlannedMealSheet } from './PlannedMealSheet'
import { TonightHero } from './TonightHero'

const fish: Tag = { id: 1, name: 'Fish', key: 'fish', colour: 'blue', recipes: 3, slotRules: 0, varietyRule: true }
const relaxed: PlannedMeal['why'] = [{ code: 'variety_relaxed', tag: 'fish', value: 3 }]
const noop = vi.fn()

function renderIn(ui: ReactNode, tags: Tag[] = [fish]) {
  mockApi({ 'GET /api/tags': tags })
  return render(<QueryClientProvider client={newQueryClient()}>{ui}</QueryClientProvider>)
}
const withWhy = (): PlanSlot => slot({ meal: meal({ why: relaxed }) })

describe('relaxed Variety chip names the Tag', () => {
  it('MealTile says "3rd Fish this week"', async () => {
    renderIn(<MealTile slot={withWhy()} today="2026-11-10" compact onOpen={noop} onSwap={noop} onChoose={noop} onCook={noop} />)
    expect(await screen.findByText('3rd Fish this week')).toBeInTheDocument()
    expect(screen.queryByText('3rd fish this week')).not.toBeInTheDocument()
  })

  it('TonightHero says "3rd Fish this week"', async () => {
    renderIn(<TonightHero slot={withWhy()} now={new Date('2026-11-10T17:00:00Z')} onCook={noop} onYesCooked={noop} onAdjust={noop} />)
    expect(await screen.findByText('3rd Fish this week')).toBeInTheDocument()
  })

  it('PlannedMealSheet says "3rd Fish this week"', async () => {
    renderIn(<PlannedMealSheet open slot={withWhy()} today="2026-11-10" onClose={noop} onCook={noop} onMarkCooked={noop} onSwap={noop} onPin={noop} onUnpin={noop} onChoose={noop} />)
    expect(await screen.findByText('3rd Fish this week')).toBeInTheDocument()
  })

  it('CourseRow says "3rd Fish this week"', async () => {
    const course = planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { recipeName: 'Green beans', why: relaxed }) })
    const s = courseSlot([planCourse({ meal: courseMeal(1, 'Main') }), course])
    const row = { course, key: { date: '2026-11-10', mealSlotId: 2, courseId: 2 }, caption: 'Side' }
    renderIn(
      <ul>
        <CourseRow row={row} slot={s} today="2026-11-10" onOpen={noop} onSwap={noop} onPin={noop} onUnpin={noop} onMarkCooked={noop} onChoose={noop} />
      </ul>,
    )
    expect(await screen.findByText('3rd Fish this week')).toBeInTheDocument()
  })

  it('falls back to the key while the Tag is unknown', () => {
    renderIn(<MealTile slot={withWhy()} today="2026-11-10" compact onOpen={noop} onSwap={noop} onChoose={noop} onCook={noop} />, [])
    expect(screen.getByText('3rd fish this week')).toBeInTheDocument()
  })
})

// CRS G2: the notice hook, the expansion hook and the fix hook with Courses.
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { EXCLUDED, NO_COURSE_RECIPES, NOBODY, WEEK, dinner, empty, flat, planned, sideWeek } from '../couldnt-fixtures'
import { courseCells, unplannedOf } from '../lib/couldntGroups'
import { useCauseExpansion } from './useCauseExpansion'
import { useCouldntFix } from './useCouldntFix'
import { useCouldntPlanNotice } from './useCouldntPlanNotice'

describe('useCouldntPlanNotice with Courses', () => {
  const slots = sideWeek(WEEK)
  const cells = unplannedOf(courseCells(slots))

  it('groups the Course cells and names the Course in the headline and the summary', () => {
    const { result } = renderHook(() => useCouldntPlanNotice(cells, courseCells(slots)))
    expect(result.current.total).toBe(7)
    expect(result.current.groups).toHaveLength(1)
    expect(result.current.groups[0]).toMatchObject({
      cause: 'excluded',
      count: 7,
      summary: 'Side at every dinner this week',
      headline: "Couldn't plan 7 Sides. Every Recipe is excluded for someone who eats it.",
    })
  })

  it('takes the plan view as `all` and the API\'s flat entries as the cells (Today)', () => {
    const entries = [flat('2026-11-10', 2, 'Side', EXCLUDED), flat('2026-11-11', 2, 'Side', EXCLUDED)]
    const { result } = renderHook(() => useCouldntPlanNotice(entries, courseCells(slots)))
    expect(result.current.groups[0]).toMatchObject({ count: 2, summary: 'Side at Tuesday and Wednesday dinners' })
  })

  it('a plain User keeps the Exclusions and Mark Recipes fixes (open to every User), loses only Choose who attends', () => {
    const mixed = [
      dinner('2026-11-10', [empty(1, 'Main', NOBODY)]),
      dinner('2026-11-11', [planned(1, 'Main'), empty(2, 'Side', NO_COURSE_RECIPES)]),
      dinner('2026-11-12', [planned(1, 'Main'), empty(2, 'Side', EXCLUDED)]),
    ]
    const asUser = renderHook(() => useCouldntPlanNotice(unplannedOf(courseCells(mixed)), courseCells(mixed), false)).result.current
    expect(asUser.groups.map((g) => [g.cause, g.canFix])).toEqual([['nobody_attending', false], ['no_course_recipes', true], ['excluded', true]])
  })
})

describe('useCauseExpansion knows the new cause', () => {
  it('toggles No Recipes for this Course like the others', () => {
    const { result } = renderHook(() => useCauseExpansion())
    act(() => result.current.toggle('no_course_recipes'))
    expect(result.current.isOpen('no_course_recipes')).toBe(true)
    expect(result.current.isOpen('excluded')).toBe(false)
  })
})

describe('useCouldntFix with Courses', () => {
  function setup(onChoose?: (key: { date: string; mealSlotId: number; courseId?: number }) => void) {
    let where = ''
    function Probe() {
      const l = useLocation()
      where = l.pathname + l.search + l.hash
      return null
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={['/']}>
        <Probe />
        {children}
      </MemoryRouter>
    )
    const hook = renderHook(() => useCouldntFix(onChoose), { wrapper })
    return { fix: hook.result, where: () => where }
  }
  const groupOf = (cells: ReturnType<typeof unplannedOf>, all = cells) => renderHook(() => useCouldntPlanNotice(cells, all)).result.current.groups[0]!

  it('"Choose a Recipe" opens the chooser for the first affected Course, with its courseId', () => {
    const onChoose = vi.fn()
    const t = setup(onChoose)
    const slots = [dinner('2026-11-10', [planned(1, 'Main'), empty(2, 'Side', { reason: 'no_candidates', slotRuleClaimed: false, eliminated: { considered: 2, exclusion: 0, coolDown: 0, varietyRule: 0, advanceStep: 2 } })])]
    const g = groupOf(unplannedOf(courseCells(slots)), courseCells(slots))
    act(() => t.fix.current(g))
    expect(onChoose).toHaveBeenCalledWith({ date: '2026-11-10', mealSlotId: 4, courseId: 2 })
  })

  it('Review Exclusions goes to the page', () => {
    const t = setup()
    const slots = sideWeek(['2026-11-12'])
    const g = groupOf(unplannedOf(courseCells(slots)), courseCells(slots))
    act(() => t.fix.current(g))
    expect(t.where()).toBe('/plan/couldnt-plan/excluded')
  })

  it('Mark Recipes as Side goes to the Recipes list filtered to Recipes not marked with it', () => {
    const t = setup()
    const slots = [dinner('2026-11-10', [planned(1, 'Main'), empty(2, 'Side', NO_COURSE_RECIPES)])]
    const g = groupOf(unplannedOf(courseCells(slots)), courseCells(slots))
    act(() => t.fix.current(g))
    expect(t.where()).toBe('/recipes?notCourse=2')
  })
})

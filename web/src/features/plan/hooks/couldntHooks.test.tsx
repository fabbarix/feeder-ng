import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { slot } from '../test-utils'
import type { Eliminations, PlanSlot, UnfilledReason } from '../types'
import { useCauseExpansion } from './useCauseExpansion'
import { useCouldntFix } from './useCouldntFix'
import { useCouldntPlanNotice } from './useCouldntPlanNotice'

const none: Eliminations = { considered: 0, exclusion: 0, coolDown: 0, varietyRule: 0, advanceStep: 0 }
function unplanned(date: string, reason: UnfilledReason, over: Partial<Eliminations> = {}, id = 2): PlanSlot {
  return slot({ date, mealSlotId: id, meal: null, unfilled: { reason, slotRuleClaimed: false, eliminated: { ...none, ...over } } })
}

describe('useCouldntPlanNotice', () => {
  const dinners = ['2026-11-10', '2026-11-11', '2026-11-12'].map((d) => unplanned(d, 'no_attendance'))

  it('groups by cause and puts the summary of the affected meals on each group', () => {
    const { result } = renderHook(() => useCouldntPlanNotice(dinners, dinners))
    expect(result.current.total).toBe(3)
    expect(result.current.groups).toHaveLength(1)
    expect(result.current.groups[0]).toMatchObject({
      cause: 'nobody_attending',
      count: 3,
      summary: 'Every dinner this week',
      headline: "Couldn't plan 3 Meal Slots. Nobody is set to attend.",
    })
  })

  it('uses the whole plan to tell "every" from "some"', () => {
    const planned = ['2026-11-13', '2026-11-14'].map((d) => slot({ date: d }))
    const { result } = renderHook(() => useCouldntPlanNotice(dinners, [...dinners, ...planned]))
    expect(result.current.groups[0]!.summary).toBe('Tuesday, Wednesday and Thursday dinners')
  })

  it('R13: past slots (no meal, no reason) are not part of "all": still "every dinner" at 23:56', () => {
    const gone = slot({ date: '2026-11-10', meal: null, unfilled: null })
    const { result } = renderHook(() => useCouldntPlanNotice(dinners, [gone, ...dinners]))
    expect(result.current.groups[0]!.summary).toBe('Every dinner this week')
  })

  it('R13: attendance is an Admin duty; the fix is withheld from a plain User, not the rest', () => {
    const late = unplanned('2026-11-12', 'no_candidates', { considered: 2, advanceStep: 2 })
    const rule = unplanned('2026-11-13', 'no_candidates', { considered: 2, exclusion: 2 })
    const asUser = renderHook(() => useCouldntPlanNotice([...dinners, late, rule], [...dinners, late, rule], false)).result.current
    expect(asUser.groups.map((g) => [g.cause, g.canFix])).toEqual([['nobody_attending', false], ['excluded', true], ['advance_step', true]])
    const asAdmin = renderHook(() => useCouldntPlanNotice([...dinners, late, rule], [...dinners, late, rule], true)).result.current
    expect(asAdmin.groups.every((g) => g.canFix)).toBe(true)
  })

  it('has no groups and a zero total when everything was planned', () => {
    const { result } = renderHook(() => useCouldntPlanNotice([], []))
    expect(result.current).toEqual({ groups: [], total: 0 })
  })

  it('returns the same groups while the slots are unchanged', () => {
    const { result, rerender } = renderHook(() => useCouldntPlanNotice(dinners, dinners))
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })
})

describe('useCauseExpansion: which cause tiles show their full list', () => {
  it('starts collapsed and toggles one cause at a time', () => {
    const { result } = renderHook(() => useCauseExpansion())
    expect(result.current.isOpen('nobody_attending')).toBe(false)
    act(() => result.current.toggle('nobody_attending'))
    expect(result.current.isOpen('nobody_attending')).toBe(true)
    expect(result.current.isOpen('excluded')).toBe(false)
    act(() => result.current.toggle('nobody_attending'))
    expect(result.current.isOpen('nobody_attending')).toBe(false)
  })
})

describe('useCouldntFix: the one fix action of a cause', () => {
  function setup(onChoose?: (key: { date: string; mealSlotId: number }) => void) {
    let path = ''
    function Probe() {
      path = useLocation().pathname
      return null
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={['/']}>
        <Probe />
        {children}
      </MemoryRouter>
    )
    const hook = renderHook(() => useCouldntFix(onChoose), { wrapper })
    return { fix: hook.result, path: () => path }
  }
  const group = (reason: UnfilledReason, over: Partial<Eliminations> = {}) => {
    const { result } = renderHook(() => useCouldntPlanNotice([unplanned('2026-11-10', reason, over)], []))
    return result.current.groups[0]!
  }

  it('a link cause goes where it is fixed', () => {
    const t = setup()
    const g = group('no_attendance') // built outside act: a nested renderHook would not commit inside it
    act(() => t.fix.current(g))
    expect(t.path()).toBe('/settings/meal-slots')
  })

  it('"Choose a Recipe" opens the chooser for the first affected meal', () => {
    const onChoose = vi.fn()
    const t = setup(onChoose)
    const g = group('no_candidates', { considered: 2, advanceStep: 2 })
    act(() => t.fix.current(g))
    expect(onChoose).toHaveBeenCalledWith({ date: '2026-11-10', mealSlotId: 2 })
    expect(t.path()).toBe('/')
  })

  it('"Choose a Recipe" without a chooser (Today) opens the Plan', () => {
    const t = setup()
    const g = group('no_candidates', { considered: 2 })
    act(() => t.fix.current(g))
    expect(t.path()).toBe('/plan')
  })
})

// MS redesign: the page hook derives the cards from the Meal Slots and Members, and opens the sheet / one-date Attendance for a card.
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { anna, householdSettings, marco, mondayLunch, thursdayDinner, tuesdayDinner } from '../components/fixtures'
import { ADMIN_ME, mockApi, routerWrapper, USER_ME } from '../test-utils'
import { useMealSlotsPage } from './useMealSlotsPage'

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 9, 12, 0) })) // Monday 9 Nov 2026
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const wednesdayDinner = { ...tuesdayDinner, id: 13, weekday: 3, time: '20:00' }
function routes(me: typeof ADMIN_ME, slots = [mondayLunch, tuesdayDinner, thursdayDinner, wednesdayDinner]) {
  return mockApi({ 'GET /api/me': me, 'GET /api/household/settings': householdSettings, 'GET /api/members': [anna, marco], 'GET /api/meal-slots': slots })
}

describe('useMealSlotsPage: cards', () => {
  it('has no cards until the Meal Slots and the Members have loaded', async () => {
    routes(ADMIN_ME)
    const { result } = renderHook(() => useMealSlotsPage(), { wrapper: routerWrapper })
    expect(result.current.cards).toEqual([])
    await waitFor(() => expect(result.current.cards.length).toBeGreaterThan(0))
  })
  it('derives one card per name, in time order (Lunch 12:30, then Dinner), from the loaded slots', async () => {
    routes(ADMIN_ME)
    const { result } = renderHook(() => useMealSlotsPage(), { wrapper: routerWrapper })
    await waitFor(() => expect(result.current.cards.map((c) => c.name)).toEqual(['Lunch', 'Dinner']))
    const dinner = result.current.cards[1]!
    expect(dinner.days).toEqual([2, 3, 4])
    expect(dinner.differences.map((d) => d.weekday)).toEqual([3, 4]) // 20:00 and 19:00 against the Tuesday 19:30 (ties go to the earliest weekday)
  })
  it('has no date rows while main has no list of date exceptions', async () => {
    routes(ADMIN_ME)
    const { result } = renderHook(() => useMealSlotsPage(), { wrapper: routerWrapper })
    await waitFor(() => expect(result.current.cards.length).toBeGreaterThan(0))
    expect(result.current.dateRows).toEqual([])
  })
})

describe('useMealSlotsPage: acting on a card', () => {
  it('changeDateOf opens the one-date Attendance on the card\'s next run (Tuesday 10 Nov for Dinner), for an Admin and for a plain User', async () => {
    for (const me of [ADMIN_ME, USER_ME]) {
      routes(me)
      const { result, unmount } = renderHook(() => useMealSlotsPage(), { wrapper: routerWrapper })
      await waitFor(() => expect(result.current.cards.length).toBe(2))
      act(() => result.current.changeDateOf(result.current.cards[1]!))
      expect(result.current.dateEditor?.slot.weekday).toBe(2)
      expect(result.current.dateEditor?.date).toBe('2026-11-10')
      expect(result.current.editor).toBeNull()
      unmount()
    }
  })
  it('changeDateOf for Lunch (Monday only) opens today, 9 Nov', async () => {
    routes(USER_ME)
    const { result } = renderHook(() => useMealSlotsPage(), { wrapper: routerWrapper })
    await waitFor(() => expect(result.current.cards.length).toBe(2))
    act(() => result.current.changeDateOf(result.current.cards[0]!))
    expect(result.current.dateEditor?.date).toBe('2026-11-09')
  })
  it('open (the "Nobody attending" button) still gives an Admin the sheet and a plain User the one-date Attendance', async () => {
    routes(USER_ME)
    const user = renderHook(() => useMealSlotsPage(), { wrapper: routerWrapper })
    await waitFor(() => expect(user.result.current.cards.length).toBe(2))
    act(() => user.result.current.open(mondayLunch))
    expect(user.result.current.dateEditor?.slot.id).toBe(mondayLunch.id)
    expect(user.result.current.editor).toBeNull()
  })
})

// B9-26 test support: a Household week as the hooks see it in the query cache, a signed-in User, and the toast on screen.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { expect } from 'vitest'
import { ME_QUERY_KEY } from '../../app/useMe'
import { ConfirmProvider, ToastProvider } from '../../ui'
import { courseMeal, courseSlot, planCourse } from './test-utils'
import type { PlanSlot, PlanView } from './types'

/** 2026-11-14 is a Saturday. Breakfast (1), Lunch (2) and Dinner (3, Main and Side, plus Dessert at slot 4) as the plan holds them. */
export const TODAY = '2026-11-14'
const one = (date: string, mealSlotId: number, name: string, time: string, recipe: string): PlanSlot =>
  courseSlot([planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main', { date, mealSlotId, recipeName: recipe }) })], { date, mealSlotId, name, time })
const dinner = (date: string, mealSlotId = 3): PlanSlot =>
  courseSlot(
    [
      planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main', { date, mealSlotId, recipeName: 'Roast chicken' }) }),
      planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { date, mealSlotId, recipeName: 'Green beans' }) }),
      planCourse({ courseId: 3, name: 'Dessert', main: false, meal: courseMeal(3, 'Dessert', { date, mealSlotId, recipeName: 'Rice pudding' }) }),
    ],
    { date, mealSlotId, name: 'Dinner', time: '19:00' },
  )
export const WEEK: PlanSlot[] = [
  one('2026-11-14', 1, 'Breakfast', '08:30', 'Slow cooker beef and barley stew'),
  dinner('2026-11-14'),
  one('2026-11-17', 1, 'Breakfast', '08:00', 'Pancakes'),
  one('2026-11-17', 2, 'Lunch', '12:30', 'Lentil soup'),
  dinner('2026-11-18'),
]
export const VIEW: PlanView = { today: TODAY, horizonDays: 7, updating: false, slots: WEEK }
export const ME = { id: 1, email: 'sam@example.com', displayName: 'Sam', isAdmin: true, householdTimeZone: 'Europe/Rome' }

/** A query client holding the plan view and the signed-in User, so a hook finds both without a request. */
export function seededClient(): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  client.setQueryData(['plan', 'view'], VIEW)
  client.setQueryData(ME_QUERY_KEY, ME)
  return client
}

export function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <ToastProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
      </QueryClientProvider>
    )
  }
}

/** The toast whose words include `text` (the toast's own text reads as one run). */
export const toastWith = (text: string): HTMLElement | undefined =>
  [...document.querySelectorAll<HTMLElement>('.toast')].find((t) => (t.textContent ?? '').replace(/\s+/g, ' ').includes(text))
export const findToastWith = (text: string) =>
  waitFor(() => {
    const el = toastWith(text)
    if (!el) throw new Error(`no toast with "${text}"; on screen: ${[...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | ')}`)
    return el
  })
/** Presses a button of a toast by its accessible name. */
export const pressInToast = (toast: HTMLElement, name: string | RegExp) => userEvent.click(within(toast).getByRole('button', { name }))
export const noToast = () => expect(document.querySelectorAll('.toast')).toHaveLength(0)
export { screen }

/** The cells a plan write changed beyond its target, as the server sends them. */
export const cell = (recipeName: string, recipeId = 1, servedFromLeftover = false) => ({ recipeId, recipeName, servedFromLeftover })
export const lunchChange = { date: '2026-11-17', mealSlotId: 2, courseId: 1, before: cell('Lentil soup'), after: cell('Chicken curry', 2), why: [] }
export const dinnerChange = { date: '2026-11-18', mealSlotId: 3, courseId: 1, before: cell('Roast chicken', 4), after: cell('Lentil soup', 1), why: [{ code: 'perishable_use', ingredient: 'Lentils', date: '2026-11-19' }] }

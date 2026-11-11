import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { anna, ben, household, prefs } from '../household.test-helper'

const h = vi.hoisted(() => ({ value: {} as import('../hooks/useHouseholdPreferences').UseHouseholdPreferences }))
vi.mock('../hooks/useHouseholdPreferences', () => ({ useHouseholdPreferences: () => h.value }))

import { IngredientExclusionList } from './IngredientExclusionList'

const view = () => render(<IngredientExclusionList ingredientId={7} ingredientName="garlic" />)

beforeEach(() => {
  h.value = household({ prefsByMember: { 1: prefs(1), 2: prefs(2, { excludedIngredients: [7] }) } })
})

describe('IngredientExclusionList', () => {
  it('is a list with a row per Member: Avatar, name and a toggle', () => {
    view()
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]!).getByRole('img', { name: 'Anna' })).toBeInTheDocument()
    expect(within(items[0]!).getByText('Anna')).toBeInTheDocument()
    expect(within(items[1]!).getByText('Ben')).toBeInTheDocument()
  })
  it('names each toggle "Sam: excludes garlic" and presses it for the Members who exclude the Ingredient', () => {
    view()
    expect(screen.getByRole('button', { name: 'Anna: excludes garlic' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Ben: excludes garlic' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('toggles for that Member at once', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Anna: excludes garlic' }))
    expect(h.value.toggleIngredient).toHaveBeenCalledWith(1, 7)
    await userEvent.click(screen.getByRole('button', { name: 'Ben: excludes garlic' }))
    expect(h.value.toggleIngredient).toHaveBeenLastCalledWith(2, 7)
  })
  it('is reachable by keyboard: Tab goes row by row and Enter or Space toggles', async () => {
    view()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Anna: excludes garlic' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Ben: excludes garlic' })).toHaveFocus()
    await userEvent.keyboard(' ')
    expect(h.value.toggleIngredient).toHaveBeenCalledTimes(2)
  })
  it('uses IconButtons with an icon and no native control', () => {
    const { container } = view()
    for (const b of screen.getAllByRole('button')) expect(b.querySelector('svg')).not.toBeNull()
    expect(container.querySelector('input, select, textarea, label')).toBeNull()
  })
  it('says there are no Members when the Household is empty', () => {
    h.value = household({ members: [], prefsByMember: {} })
    view()
    expect(screen.getByText('No Members yet')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('lists Members in Members order, whoever is signed in', () => {
    h.value = household({ members: [ben, anna], meUserId: 10 })
    view()
    expect(screen.getAllByRole('listitem').map((i) => i.textContent)).toEqual([expect.stringContaining('Ben'), expect.stringContaining('Anna')])
  })
  describe('while loading or failed', () => {
    it('shows a Skeleton, not "No Members yet" or unpressed toggles, while the Household loads', () => {
      vi.useFakeTimers()
      try {
        h.value = household({ isLoading: true, members: [], prefsByMember: {} })
        view()
        act(() => void vi.advanceTimersByTime(400))
        expect(screen.getByRole('status')).toBeInTheDocument()
        expect(screen.queryByText('No Members yet')).toBeNull()
        expect(screen.queryByRole('button')).toBeNull()
      } finally {
        vi.useRealTimers()
      }
    })
    it('shows a Skeleton, not unpressed toggles, while the Members are known but their preferences load', () => {
      vi.useFakeTimers()
      try {
        h.value = household({ isLoading: true, prefsByMember: {} })
        view()
        act(() => void vi.advanceTimersByTime(400))
        expect(screen.getByRole('status')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /excludes garlic/ })).toBeNull()
      } finally {
        vi.useRealTimers()
      }
    })
    it('shows an ErrorState whose Try again calls refetch', async () => {
      h.value = household({ isError: true, members: [], prefsByMember: {} })
      view()
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.queryByText('No Members yet')).toBeNull()
      await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
      expect(h.value.refetch).toHaveBeenCalledOnce()
    })
  })
})

import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithProviders, summaryJSON } from '../../../lib/baseRecipes/test-utils'
import { BaseRecipePicker } from './BaseRecipePicker'

// BR-D round 4: the picker's a11y: the search field is a combobox that controls the listbox; a disabled option's reason is announced.
const routes = () => ({
  'GET /api/recipes?kind=base&for=1': [
    summaryJSON({ id: 1, name: 'Roux', yield: 300, yieldUnit: 'g', wouldCycle: true }), summaryJSON({ id: 2, name: 'Béchamel', wouldCycle: true }), summaryJSON({ id: 3, name: 'Béchamel light' }),
  ],
  'GET /api/recipes': [summaryJSON({ id: 20, name: 'Pesto', baseRecipe: false, yieldUnit: null, yield: 4 })],
})
const open = async () => {
  mockApi(routes())
  renderWithProviders(<BaseRecipePicker open lineName="béchamel" recipeId={1} onClose={vi.fn()} onChoose={vi.fn()} />)
  await screen.findByRole('option', { name: /^Béchamel,/ })
}
const describedText = (el: HTMLElement) =>
  (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? '').join(' ')

describe('BaseRecipePicker: the search field is a combobox', () => {
  it('has role combobox (not searchbox), named "Search Base recipes", and controls the listbox', async () => {
    await open()
    const field = screen.getByRole('combobox', { name: 'Search Base recipes' })
    expect(screen.queryByRole('searchbox')).toBeNull()
    const listbox = screen.getByRole('listbox')
    expect(listbox.id).not.toBe('')
    expect(field).toHaveAttribute('aria-controls', listbox.id)
    expect(field).toHaveAttribute('aria-expanded', 'true')
    expect(field).toHaveAttribute('aria-autocomplete', 'list')
  })

  it('points aria-activedescendant at an option that exists', async () => {
    await open()
    const field = screen.getByRole('combobox', { name: 'Search Base recipes' })
    field.focus()
    const { default: userEvent } = await import('@testing-library/user-event')
    await userEvent.keyboard('{ArrowDown}')
    await waitFor(() => expect(field.getAttribute('aria-activedescendant')).not.toBeNull())
    expect(document.getElementById(field.getAttribute('aria-activedescendant')!)).toHaveAttribute('role', 'option')
  })
})

describe('BaseRecipePicker: a disabled option\'s reason is announced', () => {
  it('aria-describedby on the disabled Base recipe option names the reason', async () => {
    await open()
    const blocked = screen.getByRole('option', { name: /^Béchamel,/ })
    expect(blocked).toHaveAttribute('aria-disabled', 'true')
    expect(describedText(blocked)).toContain('Béchamel already calls for this Recipe')
  })

  it('an enabled option has no reason to describe', async () => {
    await open()
    const free = screen.getByRole('option', { name: /^Béchamel light/ })
    expect(describedText(free)).not.toMatch(/already calls/)
  })
})

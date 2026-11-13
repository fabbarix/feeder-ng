import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithProviders, summaryJSON } from '../../../lib/baseRecipes/test-utils'
import { BaseRecipePicker } from './BaseRecipePicker'

// BR-D round 3: the picker is a proper listbox on the shared Select panel: the search field keeps the focus and the arrows move the active option;
// disabled rows are skipped; Enter chooses; Escape closes and the focus goes back to what opened it.
const routes = (extra: Record<string, unknown> = {}) => ({
  'GET /api/recipes?kind=base': [
    summaryJSON({ id: 1, name: 'Roux', yield: 300, yieldUnit: 'g' }), summaryJSON({ id: 2, name: 'Béchamel' }), summaryJSON({ id: 3, name: 'Béchamel light' }),
  ],
  'GET /api/recipes': [{ ...summaryJSON({ id: 20, name: 'Pesto', baseRecipe: false, yieldUnit: null, yield: 4 }) }],
  ...extra,
})

/** The option that is active: the focused option, or the one the focused field points at with aria-activedescendant. */
const active = (): HTMLElement | null => {
  const el = document.activeElement as HTMLElement | null
  if (el?.getAttribute('role') === 'option') return el
  const id = el?.getAttribute('aria-activedescendant')
  return id ? document.getElementById(id) : null
}

function Host({ onChoose, recipeId }: { onChoose: (c: unknown) => void; recipeId?: number }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open picker</button>
      <BaseRecipePicker open={open} lineName="béchamel" recipeId={recipeId} onClose={() => setOpen(false)} onChoose={onChoose} />
    </>
  )
}
const openIt = async (onChoose = vi.fn(), recipeId?: number) => {
  renderWithProviders(<Host onChoose={onChoose} recipeId={recipeId} />)
  await userEvent.click(screen.getByRole('button', { name: 'Open picker' }))
  await screen.findByRole('option', { name: /^Béchamel,/ })
  return onChoose
}

describe('BaseRecipePicker keyboard', () => {
  it('puts the focus in the search field when it opens', async () => {
    mockApi(routes())
    await openIt()
    expect(screen.getByRole('searchbox', { name: 'Search Base recipes' })).toHaveFocus()
  })

  it('ArrowDown and ArrowUp move the active option through the list', async () => {
    mockApi(routes())
    await openIt()
    await userEvent.keyboard('{ArrowDown}')
    expect(active()).toHaveAccessibleName(/^Béchamel,/)
    await userEvent.keyboard('{ArrowDown}')
    expect(active()).toHaveAccessibleName(/^Béchamel light/)
    await userEvent.keyboard('{ArrowUp}')
    expect(active()).toHaveAccessibleName(/^Béchamel,/)
  })

  it('Enter chooses the active option', async () => {
    mockApi(routes())
    const onChoose = await openIt()
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(onChoose).toHaveBeenCalledWith({ kind: 'existing', baseRecipe: { id: 2, name: 'Béchamel' } })
  })

  it('reaches the create row and the Recipes you plan group by arrows alone', async () => {
    mockApi(routes())
    const onChoose = await openIt()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search Base recipes' }), 'pe')
    await screen.findByRole('option', { name: /^Pesto/ })
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
    for (let i = 0; i < 5 && !/^Pesto/.test(active()?.getAttribute('aria-label') ?? active()?.textContent ?? ''); i++) await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{Enter}')
    expect(onChoose).toHaveBeenCalledWith({ kind: 'convert', recipe: { id: 20, name: 'Pesto' } })
  })

  it('skips disabled rows: never active, never chosen, and Tab does not land on them', async () => {
    mockApi(routes({
      'GET /api/recipes/1': { ...summaryJSON({ id: 1, name: 'Roux' }), usedBy: [{ id: 2, name: 'Béchamel' }] },
      'GET /api/recipes/2': { ...summaryJSON({ id: 2, name: 'Béchamel' }), usedBy: [] },
    }))
    const onChoose = await openIt(vi.fn(), 1)
    const blocked = await screen.findByRole('option', { name: /^Béchamel,/ })
    await waitFor(() => expect(blocked).toHaveAttribute('aria-disabled', 'true'))
    expect(blocked).not.toHaveAttribute('tabindex', '0')
    await userEvent.keyboard('{ArrowDown}')
    expect(active()).not.toBe(blocked)
    expect(active()).toHaveAccessibleName(/^Béchamel light/)
    await userEvent.keyboard('{ArrowUp}{ArrowUp}{Enter}')
    expect(onChoose).not.toHaveBeenCalledWith({ kind: 'existing', baseRecipe: { id: 2, name: 'Béchamel' } })
  })

  it('Escape closes the picker and the focus returns to the button that opened it', async () => {
    mockApi(routes())
    await openIt()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Link to a Base recipe' })).toBeNull())
    expect(screen.getByRole('button', { name: 'Open picker' })).toHaveFocus()
  })

  it('keeps the groups as groups with headings, and the create row inside the listbox', async () => {
    mockApi(routes())
    await openIt()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search Base recipes' }), 'pe')
    const listbox = screen.getByRole('listbox')
    expect(await within(listbox).findByRole('group', { name: 'Recipes you plan' })).toBeInTheDocument()
    expect(within(listbox).getByRole('option', { name: 'Add "Pe" as a new Base recipe' })).toBeInTheDocument()
  })
})

describe('BaseRecipePicker copy', () => {
  it('does not say "Add it as a new one below" when there is no create row (an exact name is shown)', async () => {
    mockApi({ 'GET /api/recipes?kind=base': [summaryJSON({ id: 1, name: 'Roux' })], 'GET /api/recipes': [] })
    renderWithProviders(<BaseRecipePicker open lineName="roux" onClose={() => {}} onChoose={() => {}} />)
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Search Base recipes' }), 'rouxx')
    await screen.findByText(/No Base recipe matches/)
    expect(screen.queryByText(/Add it as a new one below/)).toBeNull()
  })
  it('says it when the create row is there', async () => {
    mockApi({ 'GET /api/recipes?kind=base': [summaryJSON({ id: 1, name: 'Roux' })], 'GET /api/recipes': [] })
    renderWithProviders(<BaseRecipePicker open lineName="ragù" onClose={() => {}} onChoose={() => {}} />)
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Search Base recipes' }), 'zzz')
    expect(await screen.findByRole('option', { name: 'Add "Zzz" as a new Base recipe' })).toBeInTheDocument()
  })
})

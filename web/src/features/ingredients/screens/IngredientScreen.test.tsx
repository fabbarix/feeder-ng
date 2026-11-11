import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { strings } from '../strings'
import type { IngredientDetail } from '../types'

const base: IngredientDetail = {
  id: 7, name: 'garlic', baseUnit: 'g', shelfLifeDays: 30,
  conversions: [{ unit: 'clove', toBase: 5 }], references: {},
}
const hook = {
  ingredient: base as IngredientDetail | undefined,
  isLoading: false,
  error: null as Error | null,
  referenceCount: 0,
  rename: vi.fn().mockResolvedValue({}),
  setBaseUnit: vi.fn().mockResolvedValue({}),
  setShelfLife: vi.fn().mockResolvedValue({}),
  setConversion: vi.fn().mockResolvedValue({}),
  removeConversion: vi.fn().mockResolvedValue({}),
  remove: vi.fn().mockResolvedValue(undefined),
}
vi.mock('../hooks/useIngredient', () => ({ useIngredient: () => hook }))
vi.mock('../hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../products', () => ({ IngredientProducts: () => <p>products tile</p> }))
vi.mock('./../components/MergeSheet', () => ({
  MergeSheet: ({ open, sourceId }: { open: boolean; sourceId: number }) => (open ? <p>merge sheet for {sourceId}</p> : null),
}))

import { IngredientScreen } from './IngredientScreen'

function setup() {
  const router = createMemoryRouter(
    [
      { path: '/ingredients', element: <p>list page</p> },
      { path: '/ingredients/:id', element: <IngredientScreen /> },
    ],
    { initialEntries: ['/ingredients/7'] },
  )
  render(<RouterProvider router={router} />)
}

describe('IngredientScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hook.ingredient = base
    hook.error = null
    hook.isLoading = false
    hook.referenceCount = 0
  })
  it('shows the name, Base Unit, Shelf Life and conversions', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Garlic' })).toBeInTheDocument()
    expect(screen.getByLabelText('Shelf Life')).toHaveValue('30')
    expect(screen.getByText('1 clove = 5 g')).toBeInTheDocument()
  })
  it('renames', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: strings.rename }))
    const field = screen.getByLabelText(strings.nameLabel)
    await userEvent.clear(field)
    await userEvent.type(field, 'Garlic bulb')
    await userEvent.click(screen.getByRole('button', { name: strings.saveName }))
    expect(hook.rename).toHaveBeenCalledWith('Garlic bulb')
  })
  it('shows a duplicate-name error on rename', async () => {
    hook.rename.mockRejectedValueOnce(new ApiError(409, 'name_taken', 'exists'))
    setup()
    await userEvent.click(screen.getByRole('button', { name: strings.rename }))
    await userEvent.type(screen.getByLabelText(strings.nameLabel), 'x')
    await userEvent.click(screen.getByRole('button', { name: strings.saveName }))
    expect(await screen.findByRole('alert')).toHaveTextContent(strings.nameTaken)
  })
  it('forwards conversion and Shelf Life edits to the hook', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: strings.removeConversion('clove') }))
    expect(hook.removeConversion).toHaveBeenCalledWith('clove')
    await userEvent.click(screen.getByRole('button', { name: strings.clearShelfLife }))
    expect(hook.setShelfLife).toHaveBeenCalledWith(null)
  })
  it('lets the Base Unit change while nothing uses the Ingredient', async () => {
    setup()
    await userEvent.click(screen.getByRole('radio', { name: 'ml' }))
    expect(hook.setBaseUnit).toHaveBeenCalledWith('ml')
    expect(screen.getByRole('button', { name: strings.deleteIngredient })).toBeEnabled()
  })
  it('locks the Base Unit and deletion while referenced', async () => {
    hook.referenceCount = 3
    hook.ingredient = { ...base, references: { 'recipe lines': 3 } }
    setup()
    expect(screen.getByText(strings.baseUnitLocked(3))).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'ml' })).toBeNull() // locked: a read-only value row, not disabled options
    expect(screen.getByRole('button', { name: strings.deleteIngredient })).toBeDisabled()
    expect(screen.getByText(strings.deleteLocked(3))).toBeInTheDocument()
  })
  it('confirms before deleting, then returns to the list', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: strings.deleteIngredient }))
    expect(hook.remove).not.toHaveBeenCalled()
    expect(screen.getByText(strings.deleteConfirm('garlic'))).toBeInTheDocument()
    const confirm = screen.getAllByRole('button', { name: strings.deleteIngredient }).at(-1)!
    await userEvent.click(confirm)
    expect(hook.remove).toHaveBeenCalled()
    expect(await screen.findByText('list page')).toBeInTheDocument()
  })
  it('opens the merge sheet for this Ingredient', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: strings.mergeInto }))
    expect(screen.getByText('merge sheet for 7')).toBeInTheDocument()
  })
  it('handles an unknown id', () => {
    hook.ingredient = undefined
    hook.error = new ApiError(404, 'not_found', 'nope')
    setup()
    expect(screen.getByText(strings.notFoundTitle)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: strings.title })).toHaveAttribute('href', '/ingredients')
  })
  it('shows a loading state, not "does not exist", while the Ingredient loads', () => {
    hook.ingredient = undefined
    hook.isLoading = true
    setup()
    expect(screen.getByRole('status')).toHaveTextContent(strings.loading)
    expect(screen.queryByText(strings.notFoundTitle)).not.toBeInTheDocument()
  })
  it('shows a failure, not "does not exist", when the load fails for another reason', () => {
    hook.ingredient = undefined
    hook.error = new ApiError(500, 'server_error', 'boom')
    setup()
    expect(screen.getByRole('alert')).toHaveTextContent(strings.actionFailed)
    expect(screen.queryByText(strings.notFoundTitle)).not.toBeInTheDocument()
  })
  it('groups its details into Bento tiles', () => {
    setup()
    expect(screen.getByRole('group', { name: strings.detailsLabel })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: strings.conversionsTitle })).toHaveClass('tile')
    expect(screen.getByRole('region', { name: strings.mergeTitle })).toHaveClass('tile')
  })
})

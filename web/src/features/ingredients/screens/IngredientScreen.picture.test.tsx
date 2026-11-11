// IM2: the Ingredient page has a Picture Tile with the shared ImagePicker (4:3); changes save at once through the hook.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PICKED_ID } from '../../../ui/ImagePicker/fake.test-helper'
import { CROP_ASPECTS } from '../../../ui/ImagePicker/lib/crop'
import { ApiError } from '../../../lib/http'
import { strings } from '../strings'
import type { IngredientDetail } from '../types'

const base: IngredientDetail = { id: 7, name: 'garlic', baseUnit: 'g', shelfLifeDays: 30, conversions: [], references: {}, image: '', imageUrl: '' }
const hook = {
  ingredient: base as IngredientDetail | undefined,
  isLoading: false,
  error: null as Error | null,
  referenceCount: 0,
  rename: vi.fn().mockResolvedValue({}),
  setBaseUnit: vi.fn().mockResolvedValue({}),
  setShelfLife: vi.fn().mockResolvedValue({}),
  setImage: vi.fn().mockResolvedValue({}),
  setConversion: vi.fn().mockResolvedValue({}),
  removeConversion: vi.fn().mockResolvedValue({}),
  remove: vi.fn().mockResolvedValue(undefined),
}
vi.mock('../hooks/useIngredient', () => ({ useIngredient: () => hook }))
vi.mock('../hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../products', () => ({ IngredientProducts: () => <p>products tile</p> }))
vi.mock('../../../ui', async (orig) => ({
  ...(await orig<object>()),
  ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker,
}))

import { IngredientScreen } from './IngredientScreen'

function setup() {
  const router = createMemoryRouter([{ path: '/ingredients/:id', element: <IngredientScreen /> }], { initialEntries: ['/ingredients/7'] })
  render(<RouterProvider router={router} />)
}
const picker = () => screen.getByRole('group', { name: strings.pictureLabel })

describe('IngredientScreen: Picture', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hook.ingredient = base
    hook.referenceCount = 0
  })

  it('is a Tile of its own named Picture holding the shared ImagePicker with the landscape crop', () => {
    setup()
    const tile = screen.getByRole('region', { name: strings.pictureLabel })
    expect(within(tile).getByRole('group', { name: strings.pictureLabel })).toBe(picker())
    expect(picker()).toHaveAttribute('data-aspect', String(CROP_ASPECTS.landscape))
    expect(picker()).toHaveAttribute('data-value', '')
  })

  it('shows the current picture id to the picker', () => {
    hook.ingredient = { ...base, image: PICKED_ID, imageUrl: `/api/images/${PICKED_ID}` }
    setup()
    expect(picker()).toHaveAttribute('data-value', PICKED_ID)
  })

  it('saves a newly picked picture through setImage', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: `pick ${strings.pictureLabel}` }))
    expect(hook.setImage).toHaveBeenCalledWith(PICKED_ID)
  })

  it('removing the picture saves an empty id', async () => {
    hook.ingredient = { ...base, image: PICKED_ID, imageUrl: `/api/images/${PICKED_ID}` }
    setup()
    await userEvent.click(screen.getByRole('button', { name: `remove ${strings.pictureLabel}` }))
    expect(hook.setImage).toHaveBeenCalledWith('')
  })

  it('shows the server message when saving fails', async () => {
    hook.setImage.mockRejectedValueOnce(new ApiError(400, 'invalid_ingredient', 'image: That image has not been uploaded'))
    setup()
    await userEvent.click(screen.getByRole('button', { name: `pick ${strings.pictureLabel}` }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('does not lock with the Base Unit: an Ingredient in use can still change its picture', async () => {
    hook.referenceCount = 3
    setup()
    await userEvent.click(screen.getByRole('button', { name: `pick ${strings.pictureLabel}` }))
    expect(hook.setImage).toHaveBeenCalled()
  })
})

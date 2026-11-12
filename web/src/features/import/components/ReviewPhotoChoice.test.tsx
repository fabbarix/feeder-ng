// WP-G: "Use this photo for the Recipe" in Import Review (ai-recipe-import.md sections 3.5, 5.2; ra-e-import.md section 6.4).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../ui'
import { pickOption } from '../../settings/test-utils'
import { photos } from '../fixtures.test-helper'
import type { PhotoChoice } from '../lib/photoChoice'
import { ReviewPhotoChoice } from './ReviewPhotoChoice'

const off: PhotoChoice = { enabled: false, photo: 0, recipe: 0 }
const on: PhotoChoice = { enabled: true, photo: 0, recipe: 0 }
const soup = [{ index: 0, name: 'Soup' }]
const two = [{ index: 0, name: 'Soup' }, { index: 1, name: 'Bread' }]

function setup(over: Partial<Parameters<typeof ReviewPhotoChoice>[0]> = {}) {
  const fns = { onToggle: vi.fn(), onPhoto: vi.fn(), onRecipe: vi.fn() }
  const view = render(
    <ToastProvider>
      <ReviewPhotoChoice importId="imp1" photos={photos(1)} recipes={soup} choice={off} {...fns} {...over} />
    </ToastProvider>,
  )
  return { ...fns, ...view }
}

describe('ReviewPhotoChoice', () => {
  it('renders nothing when the review has no candidate photos (a file, a page or text read)', () => {
    const { container } = setup({ photos: [] })
    expect(container.querySelector('.tile')).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
  })
  it('is a tile "Photo for the Recipe" with the switch "Use this photo for the Recipe", off by default', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Photo for the Recipe' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Use this photo for the Recipe' })).toHaveAttribute('aria-checked', 'false')
  })
  it('off: no thumbnails, no choices (nothing will be kept) and says so', () => {
    setup({ photos: photos(3), recipes: two })
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText('Photos are only kept if you choose to use one for the Recipe.')).toBeInTheDocument()
  })
  it('turning it on reports true', async () => {
    const { onToggle } = setup()
    await userEvent.click(screen.getByRole('switch', { name: 'Use this photo for the Recipe' }))
    expect(onToggle).toHaveBeenCalledWith(true)
  })
  it('on with one photo and one Recipe: its thumbnail from the review photo endpoint, no choices', () => {
    setup({ choice: on })
    const img = screen.getByRole('img', { name: 'Photo 1' })
    expect(img).toHaveAttribute('src', '/api/imports/imp1/photos/0')
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
  })
  it('on with several photos: a single-choice row of thumbnails (radiogroup), the chosen one checked', () => {
    setup({ photos: photos(3), choice: { ...on, photo: 1 } })
    const group = screen.getByRole('radiogroup', { name: 'Photo to keep' })
    const radios = within(group).getAllByRole('radio')
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false'])
    expect(radios.map((r) => r.getAttribute('aria-label') ?? r.textContent)).toEqual(['Photo 1', 'Photo 2', 'Photo 3'])
    const imgs = within(group).getAllByRole('img', { hidden: true })
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual(['/api/imports/imp1/photos/0', '/api/imports/imp1/photos/1', '/api/imports/imp1/photos/2'])
  })
  it('choosing a thumbnail reports its index', async () => {
    const { onPhoto } = setup({ photos: photos(3), choice: on })
    await userEvent.click(screen.getByRole('radio', { name: 'Photo 3' }))
    expect(onPhoto).toHaveBeenCalledWith(2)
  })
  it('arrow keys move the choice between thumbnails (radio semantics)', async () => {
    const { onPhoto } = setup({ photos: photos(3), choice: on })
    screen.getByRole('radio', { name: 'Photo 1' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onPhoto).toHaveBeenCalledWith(1)
  })
  it('uses no native radio or select', () => {
    const { container } = setup({ photos: photos(2), recipes: two, choice: on })
    expect(container.querySelector('input[type=radio], select')).toBeNull()
  })
  it('several Recipes: a Select "Recipe" with the names, the chosen one shown; choosing reports its index', async () => {
    const { onRecipe } = setup({ recipes: two, choice: { ...on, recipe: 0 } })
    expect(screen.getByRole('combobox', { name: 'Recipe' })).toHaveTextContent('Soup')
    await pickOption('Recipe', 'Bread')
    expect(onRecipe).toHaveBeenCalledWith(1)
  })
  it('a Recipe whose index is not its position (the first was skipped) is reported by its index', async () => {
    const { onRecipe } = setup({ recipes: [{ index: 1, name: 'Bread' }, { index: 3, name: 'Cake' }], choice: { ...on, recipe: 1 } })
    await pickOption('Recipe', 'Cake')
    expect(onRecipe).toHaveBeenCalledWith(3)
  })
  it('says only the chosen photo is kept (helper)', () => {
    setup({ photos: photos(2), choice: on })
    expect(screen.getByText('Only the chosen photo is kept. The others are left out.')).toBeInTheDocument()
  })
  it('thumbnails never use a data URL (they come from the server endpoint) and have no download link', () => {
    const { container } = setup({ photos: photos(2), choice: on })
    for (const img of container.querySelectorAll('img')) expect(img.getAttribute('src')).toMatch(/^\/api\/imports\/imp1\/photos\/\d$/)
    expect(container.querySelector('a[download]')).toBeNull()
  })
  it('disabled with no Recipe to give it to (all skipped): the switch cannot be turned on and says why', () => {
    setup({ recipes: [] })
    expect(screen.getByRole('switch', { name: 'Use this photo for the Recipe' })).toBeDisabled()
    expect(screen.getByText('Every Recipe is skipped, so there is nothing to give the photo to.')).toBeInTheDocument()
  })

  it('the chosen thumbnail shows a check as well as a ring (not colour alone); the others show none', () => {
    setup({ photos: photos(3), choice: { ...on, photo: 1 } })
    const radios = screen.getAllByRole('radio')
    expect(radios.map((r) => r.querySelector('.photo-choice__check') !== null)).toEqual([false, true, false])
    expect(radios[1]!.querySelector('.photo-choice__check')).toHaveAttribute('aria-hidden', 'true')
  })
})

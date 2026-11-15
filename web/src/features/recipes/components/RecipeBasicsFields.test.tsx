// The "Recipe" section of the editor (B9-37, RX-02; was RecipeDetailsFields.test.tsx): the Name, the Photo button beside it and the Kind.
// Kept from the old details test: field primitives only, the Name's error on the field. The Ready Meal checkbox became the Kind control
// (RecipeEditorKind.test.tsx); the Yield moved to the Ingredients head (RecipeYieldField.test.tsx); Cool-down to Planning
// (RecipePlanningFields.overrides.test.tsx).
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { emptyDraft, type DraftErrors, type RecipeDraft } from '../lib/draft'
import { RecipeBasicsFields } from './RecipeBasicsFields'

vi.mock('../../../ui', async (orig) => ({ ...(await orig<object>()), ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker }))

const view = (over: Partial<RecipeDraft> = {}, errors: DraftErrors = {}, autoFocusName = false) => {
  const props = { onName: vi.fn(), onImage: vi.fn(), onKind: vi.fn() }
  const { container } = render(<RecipeBasicsFields draft={{ ...emptyDraft(), name: 'Aioli', ...over }} errors={errors} autoFocusName={autoFocusName} {...props} />)
  return { ...props, container }
}

describe('RecipeBasicsFields', () => {
  it('holds the Name (full width), the Photo button beside it and the Kind, in that order', () => {
    const { container } = view()
    const name = screen.getByRole('textbox', { name: 'Name' })
    expect(name).toHaveValue('Aioli')
    expect(name.closest('.ui-field')).toHaveAttribute('data-size', 'full')
    const photo = screen.getByRole('button', { name: 'Photo of the Recipe: add' })
    const kind = screen.getByRole('radiogroup', { name: 'Kind' })
    expect(name.compareDocumentPosition(photo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(photo.compareDocumentPosition(kind) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(container.querySelector('.recipe-basics__name-row')).toContainElement(photo)
  })
  it('types the Name', async () => {
    const { onName } = view({ name: '' })
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'A')
    expect(onName).toHaveBeenLastCalledWith('A')
  })
  it('puts the error on the field', () => {
    view({ name: '' }, { name: 'name_required' })
    expect(screen.getByText('Give the Recipe a name.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAttribute('aria-invalid', 'true')
  })
  it('puts the cursor in the Name when asked (a new Recipe)', () => {
    view({ name: '' }, {}, true)
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus()
  })
  it('the Kind reads the draft (a Ready Meal) and reports a choice', async () => {
    const { onKind } = view({ readyMeal: true })
    expect(screen.getByRole('radio', { name: 'Ready Meal' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(screen.getByRole('radio', { name: 'Base recipe' }))
    expect(onKind).toHaveBeenCalledWith('base')
  })
})

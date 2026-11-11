import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { strings } from '../strings'
import type { Ingredient, SearchResult } from '../types'
import { NewIngredientSheet, type NewIngredientSheetProps } from './NewIngredientSheet'

const garlic: Ingredient = { id: 7, name: 'Garlic', baseUnit: 'g', shelfLifeDays: null, conversions: [] }
const none: SearchResult = { exact: null, suggestions: [] }

const created: Ingredient = { id: 99, name: 'Saffron', baseUnit: 'g', shelfLifeDays: null, conversions: [] }

function setup(over: Partial<NewIngredientSheetProps> = {}) {
  const props: NewIngredientSheetProps = {
    open: true,
    onClose: vi.fn(),
    onCreate: vi.fn().mockResolvedValue(created),
    findSimilar: vi.fn().mockResolvedValue(none),
    ...over,
  }
  render(<NewIngredientSheet {...props} />)
  return props
}
const name = () => screen.getByLabelText(strings.nameLabel)
const create = () => screen.getByRole('button', { name: strings.createIngredient })
const unit = (label: string) => screen.getByRole('radio', { name: label })

describe('NewIngredientSheet: layout (F-09)', () => {
  it('is a dialog with a labelled Name, a labelled Base Unit group with a helper, and an optional Shelf Life', () => {
    setup()
    expect(screen.getByRole('dialog', { name: strings.newIngredient })).toBeInTheDocument()
    expect(name()).toBeInTheDocument()
    const group = screen.getByRole('radiogroup', { name: strings.baseUnitLabel })
    expect(group).toHaveAccessibleDescription(strings.sheet.baseUnitHelper)
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual(['g', 'ml', 'piece'])
    expect(screen.getByLabelText(new RegExp(strings.sheet.shelfLifeLabel))).toBeInTheDocument()
    expect(screen.getByText(strings.sheet.shelfLifeHelper)).toBeInTheDocument()
  })
  it('draws an icon on every Base Unit option', () => {
    setup()
    for (const r of within(screen.getByRole('radiogroup', { name: strings.baseUnitLabel })).getAllByRole('radio')) {
      expect(r.querySelector('svg')).not.toBeNull()
    }
  })
  it('has no chip filter buttons any more: the Base Unit is one radio group', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'ml' })).toBeNull()
  })
  it('puts Cancel before Create Ingredient in one action bar', () => {
    setup()
    const cancel = screen.getByRole('button', { name: strings.sheet.cancel })
    expect(cancel.compareDocumentPosition(create()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(cancel.parentElement).toBe(create().parentElement)
  })
  it('leaves room for the later picture field without rendering one', () => {
    setup()
    expect(document.querySelector('input[type=file]')).toBeNull()
  })
})

describe('NewIngredientSheet: while creating', () => {
  it('disables the Base Unit options until the create settles', async () => {
    let finish: (i: Ingredient) => void = () => {}
    setup({ initialName: 'Saffron', onCreate: vi.fn(() => new Promise<Ingredient>((r) => { finish = r })) })
    await userEvent.click(create())
    await waitFor(() => expect(unit('ml')).toBeDisabled())
    expect(unit('g')).toBeDisabled()
    expect(unit('piece')).toBeDisabled()
    finish(created)
  })
})

describe('NewIngredientSheet: default Base Unit', () => {
  it('preselects g, so Create is never disabled for a missing unit', () => {
    setup({ initialName: 'Flour' })
    expect(unit('g')).toBeChecked()
    expect(create()).toBeEnabled()
  })
  it.each([
    ['ml', 'ml'],
    ['tbsp', 'ml'],
    ['piece', 'piece'],
    ['kg', 'g'],
    ['clove', 'g'],
  ])('preselects the Base Unit for the known unit %s', (hint, expected) => {
    setup({ unitHint: hint })
    expect(unit(expected)).toBeChecked()
  })
  it('shows the selected state beyond colour (aria-checked on exactly one option)', async () => {
    setup()
    await userEvent.click(unit('piece'))
    expect(unit('piece')).toBeChecked()
    expect(unit('g')).not.toBeChecked()
  })
})

describe('NewIngredientSheet: creating', () => {
  it('prefills the name (quick create) and keeps it editable', async () => {
    setup({ initialName: 'saffron' })
    expect(name()).toHaveValue('saffron')
    await userEvent.type(name(), 's')
    expect(name()).toHaveValue('saffrons')
  })
  it('creates with the name, Base Unit and Shelf Life, then closes', async () => {
    const p = setup()
    await userEvent.type(name(), '  Olive oil ')
    await userEvent.click(unit('ml'))
    await userEvent.type(screen.getByLabelText(new RegExp(strings.sheet.shelfLifeLabel)), '365')
    await userEvent.click(create())
    expect(p.onCreate).toHaveBeenCalledWith({ name: 'Olive oil', baseUnit: 'ml', shelfLifeDays: 365 })
    expect(p.onClose).toHaveBeenCalled()
  })
  it('leaves Shelf Life out when it is blank', async () => {
    const p = setup({ initialName: 'Flour' })
    await userEvent.click(create())
    expect(p.onCreate).toHaveBeenCalledWith({ name: 'Flour', baseUnit: 'g' })
    expect((p.onCreate as ReturnType<typeof vi.fn>).mock.calls[0]![0]).not.toHaveProperty('shelfLifeDays')
  })
  it('keeps Create enabled on an empty name and explains inside the field, then focuses it', async () => {
    const p = setup()
    expect(create()).toBeEnabled()
    await userEvent.click(create())
    expect(p.onCreate).not.toHaveBeenCalled()
    expect(name()).toHaveAccessibleDescription(strings.sheet.nameRequired)
    expect(name()).toHaveFocus()
  })
  it('explains an invalid Shelf Life inside its field', async () => {
    const p = setup({ initialName: 'Milk' })
    const shelf = screen.getByLabelText(new RegExp(strings.sheet.shelfLifeLabel))
    await userEvent.type(shelf, '0')
    await userEvent.click(create())
    expect(p.onCreate).not.toHaveBeenCalled()
    expect(shelf).toHaveAccessibleDescription(new RegExp(strings.sheet.shelfLifeInvalid))
  })
  it('shows a taken name as the Name field error, not as a loose alert, and stays open', async () => {
    const p = setup({ initialName: 'onion', onCreate: vi.fn().mockRejectedValue(new ApiError(409, 'name_taken', 'exists')) })
    await userEvent.click(create())
    expect(await screen.findByText(strings.nameTaken)).toBeInTheDocument()
    expect(name()).toHaveAccessibleDescription(strings.nameTaken)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(p.onClose).not.toHaveBeenCalled()
  })
  it('shows "Creating…" and blocks a second click while the request runs', async () => {
    let finish: (i: Ingredient) => void = () => {}
    const onCreate = vi.fn().mockImplementation(() => new Promise<Ingredient>((resolve) => (finish = resolve)))
    setup({ initialName: 'Flour', onCreate })
    await userEvent.click(create())
    const busy = await screen.findByRole('button', { name: strings.sheet.creating })
    expect(busy).toBeDisabled()
    finish(created)
  })
  it('with a reason (offline): Create is disabled and the reason is on screen', async () => {
    const p = setup({ initialName: 'Flour', disabledReason: strings.sheet.offlineReason })
    expect(create()).toBeDisabled()
    expect(screen.getByText(strings.sheet.offlineReason)).toBeInTheDocument()
    await userEvent.click(create())
    expect(p.onCreate).not.toHaveBeenCalled()
  })
  it('Cancel closes without creating', async () => {
    const p = setup({ initialName: 'Flour' })
    await userEvent.click(screen.getByRole('button', { name: strings.sheet.cancel }))
    expect(p.onClose).toHaveBeenCalled()
    expect(p.onCreate).not.toHaveBeenCalled()
  })
})

describe('NewIngredientSheet: near duplicates ("Did you mean Garlic?")', () => {
  const similar: SearchResult = { exact: null, suggestions: [{ ingredient: garlic, score: 0.88 }] }

  it('asks before creating a name that is close to an existing Ingredient', async () => {
    const p = setup({ initialName: 'Garlik', findSimilar: vi.fn().mockResolvedValue(similar), onUseExisting: vi.fn() })
    await userEvent.click(create())
    expect(p.findSimilar).toHaveBeenCalledWith('Garlik')
    expect(await screen.findByText(strings.sheet.didYouMean('Garlic'))).toBeInTheDocument()
    expect(p.onCreate).not.toHaveBeenCalled()
    expect(p.onClose).not.toHaveBeenCalled()
  })
  it('"Use Garlic" hands the existing Ingredient back and closes', async () => {
    const p = setup({ initialName: 'Garlik', findSimilar: vi.fn().mockResolvedValue(similar), onUseExisting: vi.fn() })
    await userEvent.click(create())
    await userEvent.click(await screen.findByRole('button', { name: strings.sheet.useExisting('Garlic') }))
    expect(p.onUseExisting).toHaveBeenCalledWith(garlic)
    expect(p.onClose).toHaveBeenCalled()
    expect(p.onCreate).not.toHaveBeenCalled()
  })
  it('"Create \'Garlik\' anyway" creates without asking again', async () => {
    const p = setup({ initialName: 'Garlik', findSimilar: vi.fn().mockResolvedValue(similar), onUseExisting: vi.fn() })
    await userEvent.click(create())
    await userEvent.click(await screen.findByRole('button', { name: strings.sheet.createAnyway('Garlik') }))
    expect(p.onCreate).toHaveBeenCalledWith({ name: 'Garlik', baseUnit: 'g' })
    expect(p.findSimilar).toHaveBeenCalledTimes(1)
  })
  it('an exact match says it exists, offers to use it and does not offer to create a twin', async () => {
    const p = setup({ initialName: 'garlic', findSimilar: vi.fn().mockResolvedValue({ exact: garlic, suggestions: [] }), onUseExisting: vi.fn() })
    await userEvent.click(create())
    expect(await screen.findByText(strings.sheet.alreadyExists('Garlic'))).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: strings.sheet.createAnyway('garlic') })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: strings.sheet.useExisting('Garlic') }))
    expect(p.onUseExisting).toHaveBeenCalledWith(garlic)
    expect(p.onCreate).not.toHaveBeenCalled()
  })
  it('creates straight away when nothing is close', async () => {
    const p = setup({ initialName: 'Saffron' })
    await userEvent.click(create())
    expect(p.onCreate).toHaveBeenCalledOnce()
  })
  it('creates anyway when the lookup itself fails (the lookup only advises)', async () => {
    const p = setup({ initialName: 'Saffron', findSimilar: vi.fn().mockRejectedValue(new Error('network')) })
    await userEvent.click(create())
    expect(p.onCreate).toHaveBeenCalledOnce()
  })
  it('does not look up an empty name', async () => {
    const p = setup()
    await userEvent.click(create())
    expect(p.findSimilar).not.toHaveBeenCalled()
  })
})

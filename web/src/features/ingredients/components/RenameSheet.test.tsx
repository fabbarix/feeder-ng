// B9-48 (SET-05, SAFE-04): Rename is a sheet "Rename <name>" opened from the header's Rename IconButton (mock set-05-rename.html).
//
// API pinned here (components/RenameSheet.tsx):
//   <RenameSheet open kind={IngredientKind} name={string} onClose={() => void} onSave={(name: string) => Promise<unknown>} />
//   A BottomSheet titled "Rename <displayName(name)>": one full-width Name field holding the STORED name, focused with its text selected,
//   helper "Recipes, Stock and the Shopping List show the new name."; the footer is an outline Cancel and the primary "Save name"; no Close
//   (R-B: the footer has Cancel). Save: trims and collapses spaces; unchanged (after trim) or Cancel only closes; blank: the field error
//   "Give the Ingredient a name" (a Supply: "Give the Supply a name"), nothing sent, focus in the field; onSave rejects with name_taken:
//   the field error "An Ingredient with that name already exists", focus in the field, the sheet stays open; any other rejection: the one
//   FormError ("That did not work. Try again."), the sheet stays open; success: onClose().
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { RenameSheet } from './RenameSheet'

const setup = (over: Partial<Parameters<typeof RenameSheet>[0]> = {}) => {
  const props = { open: true, kind: 'food' as const, name: 'garlic', onClose: vi.fn(), onSave: vi.fn().mockResolvedValue({}), ...over }
  render(<RenameSheet {...props} />)
  return props
}
const dialog = () => screen.getByRole('dialog', { name: 'Rename Garlic' })
const field = () => within(dialog()).getByRole('textbox', { name: 'Name' }) as HTMLInputElement

describe('RenameSheet: anatomy', () => {
  it('is a dialog named for the Ingredient, with the Name field focused and selected', () => {
    setup()
    expect(field()).toHaveValue('garlic')
    expect(field()).toHaveFocus()
    expect(field().selectionStart).toBe(0)
    expect(field().selectionEnd).toBe('garlic'.length)
  })
  it('says what a rename changes, as the field helper', () => {
    setup()
    expect(field()).toHaveAccessibleDescription('Recipes, Stock and the Shopping List show the new name.')
  })
  it('has Cancel and Save name in the footer and NO Close', () => {
    setup()
    expect(within(dialog()).getByRole('button', { name: 'Cancel' })).toHaveAttribute('data-variant', 'secondary')
    expect(within(dialog()).getByRole('button', { name: 'Save name' })).toHaveAttribute('data-variant', 'primary')
    expect(within(dialog()).queryByRole('button', { name: 'Close' })).toBeNull()
  })
  it('a Supply is named as one', () => {
    setup({ kind: 'supply', name: 'dish soap' })
    expect(screen.getByRole('dialog', { name: 'Rename Dish soap' })).toBeInTheDocument()
  })
  it('renders nothing while closed', () => {
    setup({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('RenameSheet: saving', () => {
  it('saves the typed name, trimmed and with spaces collapsed, then closes', async () => {
    const p = setup()
    await userEvent.clear(field())
    await userEvent.type(field(), '  Garlic   bulb ')
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save name' }))
    expect(p.onSave).toHaveBeenCalledWith('Garlic bulb')
    await vi.waitFor(() => expect(p.onClose).toHaveBeenCalled())
  })
  it('Enter saves', async () => {
    const p = setup()
    await userEvent.type(field(), ' bulb{Enter}')
    expect(p.onSave).toHaveBeenCalledWith('garlic bulb')
  })
  it('an unchanged name only closes', async () => {
    const p = setup()
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save name' }))
    expect(p.onSave).not.toHaveBeenCalled()
    expect(p.onClose).toHaveBeenCalled()
  })
  it('Cancel closes without saving', async () => {
    const p = setup()
    await userEvent.type(field(), 'x')
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }))
    expect(p.onSave).not.toHaveBeenCalled()
    expect(p.onClose).toHaveBeenCalled()
  })
})

describe('RenameSheet: errors at the field', () => {
  it('a blank name: the message under Name, aria-invalid, focus there, nothing sent, no alert', async () => {
    const p = setup()
    await userEvent.clear(field())
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save name' }))
    expect(p.onSave).not.toHaveBeenCalled()
    expect(field()).toHaveAttribute('aria-invalid', 'true')
    expect(field()).toHaveAccessibleDescription(/Give the Ingredient a name/)
    expect(field()).toHaveFocus()
    expect(screen.queryAllByRole('alert')).toEqual([])
  })
  it('a Supply words the blank error for a Supply', async () => {
    setup({ kind: 'supply', name: 'dish soap' })
    await userEvent.clear(field())
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save name' }))
    expect(field()).toHaveAccessibleDescription(/Give the Supply a name/)
  })
  it('a taken name: at the field, the sheet stays open', async () => {
    const p = setup({ onSave: vi.fn().mockRejectedValue(new ApiError(409, 'name_taken', 'exists')) })
    await userEvent.type(field(), 'x')
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save name' }))
    expect(await vi.waitFor(() => field())).toHaveAccessibleDescription(/An Ingredient with that name already exists/)
    expect(field()).toHaveAttribute('aria-invalid', 'true')
    expect(field()).toHaveFocus()
    expect(p.onClose).not.toHaveBeenCalled()
    expect(screen.queryAllByRole('alert')).toEqual([])
  })
  it('another failure is the form-level alert, once', async () => {
    const p = setup({ onSave: vi.fn().mockRejectedValue(new ApiError(500, 'server_error', 'boom')) })
    await userEvent.type(field(), 'x')
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save name' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That did not work. Try again.')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(p.onClose).not.toHaveBeenCalled()
  })
  it('the field error clears when the name is edited', async () => {
    setup()
    await userEvent.clear(field())
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save name' }))
    await userEvent.type(field(), 'g')
    expect(field()).not.toHaveAttribute('aria-invalid', 'true')
  })
})

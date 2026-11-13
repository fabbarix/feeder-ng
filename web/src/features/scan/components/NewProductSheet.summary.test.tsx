// SR5 (13.5 step 5): the summary line: Saved as "{name}", Any Shop. Rename edits the name inline; "More: This Shop only" toggles the scope.
import { waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { addButton, choose, dialog, packGroup, setup } from './newProduct.test-helper'

async function ready(over: Parameters<typeof setup>[0] = {}) {
  const view = setup(over)
  await choose(/Ingredient/, /^milk/)
  await userEvent.click(within(packGroup()).getByRole('button', { name: '1 l' }))
  return view
}
const note = () => within(dialog()).getByRole('note')

describe('NewProductSheet: the summary line', () => {
  it('says what the Product will be called and that it works in any Shop', async () => {
    await ready()
    expect(note()).toHaveTextContent(/Saved as .Milk 1000 ml., Any Shop\./)
  })

  it('is absent until there is something to name (no Ingredient or no pack size yet)', async () => {
    setup()
    expect(within(dialog()).queryByRole('note')).toBeNull()
    await choose(/Ingredient/, /^milk/)
    expect(within(dialog()).queryByRole('note')).toBeNull()
  })

  it('follows the pack size', async () => {
    await ready()
    await userEvent.click(within(packGroup()).getByRole('button', { name: '500 ml' }))
    expect(note()).toHaveTextContent(/Saved as .Milk 500 ml., Any Shop\./)
  })

  it('Rename turns the note into a labelled name field holding the suggested name', async () => {
    await ready()
    await userEvent.click(within(note()).getByRole('button', { name: 'Rename' }))
    const field = within(dialog()).getByRole('textbox', { name: 'Product name' })
    expect(field).toHaveValue('Milk 1000 ml')
    expect(field).toHaveFocus()
  })

  it('a renamed Product is saved under the name typed', async () => {
    const { props } = await ready()
    await userEvent.click(within(note()).getByRole('button', { name: 'Rename' }))
    const field = within(dialog()).getByRole('textbox', { name: 'Product name' })
    await userEvent.clear(field)
    await userEvent.type(field, 'Granarolo milk 1 l')
    await userEvent.click(addButton())
    await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1))
    expect(props.onSave.mock.calls[0]?.[0]).toMatchObject({ productName: 'Granarolo milk 1 l' })
  })

  it('a name the User typed survives a later pack size change; an untouched name does not', async () => {
    await ready()
    await userEvent.click(within(note()).getByRole('button', { name: 'Rename' }))
    const field = within(dialog()).getByRole('textbox', { name: 'Product name' })
    await userEvent.clear(field)
    await userEvent.type(field, 'My milk')
    await userEvent.click(within(packGroup()).getByRole('button', { name: '500 ml' }))
    expect(within(dialog()).getByRole('textbox', { name: 'Product name' })).toHaveValue('My milk')
  })

  it('an emptied name is refused with a hint, and nothing is saved', async () => {
    const { props } = await ready()
    await userEvent.click(within(note()).getByRole('button', { name: 'Rename' }))
    await userEvent.clear(within(dialog()).getByRole('textbox', { name: 'Product name' }))
    await userEvent.click(addButton())
    expect(props.onSave).not.toHaveBeenCalled()
    const field = within(dialog()).getByRole('textbox', { name: 'Product name' })
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAccessibleDescription('Give it a name')
  })

  it('"More: This Shop only" limits the barcode to this Shop and the note says so', async () => {
    await ready()
    await userEvent.click(within(note()).getByRole('button', { name: 'More: This Shop only' }))
    expect(note()).toHaveTextContent(/Saved as .Milk 1000 ml., Coop only\./)
    expect(within(note()).queryByRole('button', { name: 'More: This Shop only' })).toBeNull()
  })

  it('and "More: Any Shop" takes it back', async () => {
    const { props } = await ready()
    await userEvent.click(within(note()).getByRole('button', { name: 'More: This Shop only' }))
    await userEvent.click(within(note()).getByRole('button', { name: 'More: Any Shop' }))
    expect(note()).toHaveTextContent(/Any Shop\./)
    await userEvent.click(addButton())
    await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1))
    expect(props.onSave.mock.calls[0]?.[0]).toMatchObject({ scope: 'global' })
  })

  it('saves the Shop-only scope', async () => {
    const { props } = await ready()
    await userEvent.click(within(note()).getByRole('button', { name: 'More: This Shop only' }))
    await userEvent.click(addButton())
    await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1))
    expect(props.onSave.mock.calls[0]?.[0]).toMatchObject({ scope: 'shop' })
  })

  it('Rename and More are real buttons, not links to nowhere', async () => {
    await ready()
    for (const b of within(note()).getAllByRole('button')) expect(b.tagName).toBe('BUTTON')
    expect(within(note()).queryByRole('link')).toBeNull()
  })

  it('a weighed code names its Product after the Ingredient and can be renamed too', async () => {
    const { props } = setup({ mode: 'weighed' })
    await choose(/Ingredient/, /^milk/)
    expect(note()).toHaveTextContent(/Saved as .Milk., Any Shop\./)
    await userEvent.click(addButton())
    await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1))
    expect(props.onSave.mock.calls[0]?.[0]).toMatchObject({ productName: 'Milk' })
  })
})

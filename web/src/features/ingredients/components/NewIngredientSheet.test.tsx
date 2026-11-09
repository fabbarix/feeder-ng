import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { strings } from '../strings'
import { NewIngredientSheet } from './NewIngredientSheet'

function setup(onCreate = vi.fn().mockResolvedValue({})) {
  const onClose = vi.fn()
  render(<NewIngredientSheet open onClose={onClose} onCreate={onCreate} />)
  return { onCreate, onClose }
}

describe('NewIngredientSheet', () => {
  it('needs a name and a Base Unit before it can create', async () => {
    setup()
    const create = screen.getByRole('button', { name: strings.createIngredient })
    expect(create).toBeDisabled()
    await userEvent.type(screen.getByLabelText(strings.nameLabel), 'flour')
    expect(create).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'g' }))
    expect(create).toBeEnabled()
  })
  it('creates with the chosen Base Unit and closes', async () => {
    const { onCreate, onClose } = setup()
    await userEvent.type(screen.getByLabelText(strings.nameLabel), '  Olive oil ')
    await userEvent.click(screen.getByRole('button', { name: 'ml' }))
    await userEvent.click(screen.getByRole('button', { name: strings.createIngredient }))
    expect(onCreate).toHaveBeenCalledWith({ name: 'Olive oil', baseUnit: 'ml' })
    expect(onClose).toHaveBeenCalled()
  })
  it('shows a duplicate-name error and stays open', async () => {
    const { onClose } = setup(vi.fn().mockRejectedValue(new ApiError(409, 'name_taken', 'exists')))
    await userEvent.type(screen.getByLabelText(strings.nameLabel), 'onion')
    await userEvent.click(screen.getByRole('button', { name: 'piece' }))
    await userEvent.click(screen.getByRole('button', { name: strings.createIngredient }))
    expect(await screen.findByRole('alert')).toHaveTextContent(strings.nameTaken)
    expect(onClose).not.toHaveBeenCalled()
  })
})

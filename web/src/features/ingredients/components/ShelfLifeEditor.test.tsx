import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { strings } from '../strings'
import { ShelfLifeEditor } from './ShelfLifeEditor'

describe('ShelfLifeEditor', () => {
  it('shows the current Shelf Life', () => {
    render(<ShelfLifeEditor days={7} onSave={() => {}} />)
    expect(screen.getByText('7 days')).toBeInTheDocument()
    expect(screen.getByLabelText(strings.shelfLifeLabel)).toHaveValue('7')
  })
  it('says there is none, and offers no clear button', () => {
    render(<ShelfLifeEditor days={null} onSave={() => {}} />)
    expect(screen.getByText(strings.noShelfLife)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: strings.clearShelfLife })).not.toBeInTheDocument()
  })
  it('saves a whole number of days', async () => {
    const onSave = vi.fn()
    render(<ShelfLifeEditor days={null} onSave={onSave} />)
    await userEvent.type(screen.getByLabelText(strings.shelfLifeLabel), '14')
    await userEvent.click(screen.getByRole('button', { name: strings.saveShelfLife }))
    expect(onSave).toHaveBeenCalledWith(14)
  })
  it('clears', async () => {
    const onSave = vi.fn()
    render(<ShelfLifeEditor days={7} onSave={onSave} />)
    await userEvent.click(screen.getByRole('button', { name: strings.clearShelfLife }))
    expect(onSave).toHaveBeenCalledWith(null)
  })
  it('refuses invalid text', async () => {
    const onSave = vi.fn()
    render(<ShelfLifeEditor days={null} onSave={onSave} />)
    await userEvent.type(screen.getByLabelText(strings.shelfLifeLabel), '0')
    await userEvent.click(screen.getByRole('button', { name: strings.saveShelfLife }))
    expect(screen.getByRole('alert')).toHaveTextContent(strings.errors.daysInvalid)
    expect(onSave).not.toHaveBeenCalled()
  })
})

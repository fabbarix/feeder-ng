import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { frozenChilli, leftover, TODAY } from '../../lib/leftovers/fixtures'
import { LeftoverRow, type LeftoverRowProps } from './LeftoverRow'

const view = (over: Partial<LeftoverRowProps> = {}) => {
  const onAction = vi.fn()
  render(
    <MemoryRouter>
      <LeftoverRow leftover={leftover({ useBy: '2026-11-13' })} today={TODAY} onAction={onAction} {...over} />
    </MemoryRouter>,
  )
  return { onAction }
}
const menu = async (name = 'Actions for Chilli') => {
  await userEvent.click(screen.getByRole('button', { name }))
  return screen.getByRole('menu', { name })
}

describe('LeftoverRow', () => {
  it('shows the Recipe name, portions and Use-by', () => {
    view()
    expect(screen.getByText('Chilli')).toBeInTheDocument()
    expect(screen.getByText('3 portions · Use by tomorrow')).toBeInTheDocument()
  })
  it('the row menu offers Had it, Threw it out and Freeze it', async () => {
    view()
    const m = await menu()
    expect(within(m).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Had it', 'Threw it out', 'Freeze it'])
  })
  it('choosing an entry reports the action and the Leftover', async () => {
    const { onAction } = view()
    await userEvent.click(within(await menu()).getByRole('menuitem', { name: 'Freeze it' }))
    expect(onAction).toHaveBeenCalledWith('freeze', expect.objectContaining({ id: 1 }))
  })
  it('Threw it out is the danger entry', async () => {
    view()
    expect(within(await menu()).getByRole('menuitem', { name: 'Threw it out' })).toHaveAttribute('data-tone', 'danger')
  })
  it('a frozen Leftover shows a snowflake, its Storage Place and Take out instead of Freeze it', async () => {
    view({ leftover: frozenChilli({ id: 5 }) })
    expect(screen.getByText(/Garage Freezer/)).toBeInTheDocument()
    const m = await menu()
    expect(within(m).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Had it', 'Threw it out', 'Take out'])
  })
  it('Freeze it is not offered once the Use-by has passed', async () => {
    view({ leftover: leftover({ useBy: '2026-11-11' }) })
    expect(within(await menu()).queryByRole('menuitem', { name: 'Freeze it' })).toBeNull()
  })
})

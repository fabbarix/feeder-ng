// B9-45 (PC-13, decision PC 7): Leftovers of one Recipe with the same Use-by are ONE row; its actions take from the soonest first; a Leftover that
// is planned for says how many portions a meal takes and how many are spare. Today is 2026-11-12; 2026-11-17 is a Tuesday.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { leftover, TODAY } from '../../lib/leftovers/fixtures'
import { LeftoverItems, type LeftoverItemsProps } from './LeftoverItems'

const a = leftover({ id: 1, recipeId: 10, portions: 1.25, cookedOn: '2026-11-10', useBy: '2026-11-17' })
const b = leftover({ id: 2, recipeId: 10, portions: 1.25, cookedOn: '2026-11-11', useBy: '2026-11-17' })
const view = (over: Partial<LeftoverItemsProps> = {}) => {
  const onAction = vi.fn()
  const onAnswer = vi.fn()
  const { container } = render(
    <MemoryRouter>
      <LeftoverItems leftovers={[a, b]} today={TODAY} onAction={onAction} onAnswer={onAnswer} {...over} />
    </MemoryRouter>,
  )
  return { onAction, onAnswer, container }
}

describe('LeftoverItems: one row per Recipe and Use-by', () => {
  it('shows two Leftovers of one Recipe with the same Use-by as one row: "Use by Tue · 2.5 portions"', () => {
    const { container } = view()
    expect(container.querySelectorAll('.list-row')).toHaveLength(1)
    expect(screen.getByText('Chilli')).toBeInTheDocument()
    expect(screen.getByText('Use by Tue · 2.5 portions')).toBeInTheDocument()
  })

  it('shows two rows when the Use-by differs', () => {
    const { container } = view({ leftovers: [a, { ...b, useBy: '2026-11-18' }] })
    expect(container.querySelectorAll('.list-row')).toHaveLength(2)
  })

  it('an action is reported for the merged Leftover: every id, the portions summed', async () => {
    const { onAction } = view()
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Chilli' }))
    await userEvent.click(within(screen.getByRole('menu', { name: 'Actions for Chilli' })).getByRole('menuitem', { name: 'Freeze it' }))
    expect(onAction).toHaveBeenCalledWith('freeze', expect.objectContaining({ id: 1, ids: [1, 2], portions: 2.5 }))
  })
})

describe('LeftoverItems: too few for a meal', () => {
  const planned = { ...a, id: 3, portions: 2.5, plannedPortions: 1.25, useBy: '2026-11-17' }

  it('adds a second meta line: "1.25 for Mon Dinner · 1.25 spare: have it or freeze it"', () => {
    const { container } = view({ leftovers: [planned], plannedFor: { 3: ['Mon Dinner'] } })
    const metas = [...container.querySelectorAll('.list-row__meta')].map((m) => m.textContent)
    expect(metas).toEqual(['Use by Tue · 2.5 portions', '1.25 for Mon Dinner · 1.25 spare: have it or freeze it'])
  })

  it('adds nothing for a Leftover nothing is planned for', () => {
    const { container } = view({ leftovers: [a] })
    expect(container.querySelectorAll('.list-row__meta')).toHaveLength(1)
  })

  it('says "Planned for Sun Dinner" when all of it is planned', () => {
    const { container } = view({ leftovers: [{ ...planned, plannedPortions: 2.5 }], plannedFor: { 3: ['Sun Dinner'] } })
    expect(container.textContent).toContain('Planned for Sun Dinner')
  })
})

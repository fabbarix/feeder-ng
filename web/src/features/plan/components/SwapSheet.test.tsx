import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { slot } from '../test-utils'
import type { Alternative } from '../types'
import { SwapSheet } from './SwapSheet'

const alt = (id: number, name: string, extra: Partial<Alternative> = {}): Alternative => ({
  recipeId: id, recipeName: name, batches: 1, newLeftoverPortions: 0, newLeftoverUseBy: '', score: 3, why: [], ...extra,
})

const alternatives = [
  alt(1, 'Stew', { batches: 2, newLeftoverPortions: 2, newLeftoverUseBy: '2026-11-13', why: [{ code: 'perishable_use', ingredient: 'carrots', date: '2026-11-12' }] }),
  alt(2, 'Pizza', { photoUrl: '/img/pizza.jpg', why: [{ code: 'slot_rule', tag: 'pizza' }, { code: 'favourite', members: ['Ben'] }] }),
  alt(3, 'Soup', { why: [{ code: 'best_available' }] }),
  alt(4, 'Fourth', {}),
]

function setup(over: Partial<React.ComponentProps<typeof SwapSheet>> = {}) {
  const onPick = vi.fn()
  const onClose = vi.fn()
  render(
    <SwapSheet open onClose={onClose} slot={slot({ date: '2026-11-13' })} alternatives={alternatives} isLoading={false} onPick={onPick} {...over} />,
  )
  return { onPick, onClose }
}

describe('SwapSheet (rows are the buttons)', () => {
  it('is titled "Swap for…" without a subtitle', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Swap for…' })).toBeInTheDocument()
    expect(screen.queryByText('The best alternatives under the same scoring')).not.toBeInTheDocument()
  })

  it('shows three alternatives as list rows, each with a thumb and its reason as meta', () => {
    setup()
    const list = screen.getByRole('list', { name: 'Alternatives' })
    expect(list.querySelectorAll('li')).toHaveLength(3)
    expect(screen.queryByText('Fourth')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stew' })).toBeInTheDocument()
    expect(screen.getByText(/uses carrots by Thu/)).toBeInTheDocument()
    expect(screen.getByText(/Slot Rule: Friday/)).toBeInTheDocument() // the slot is on a Friday
    expect(screen.queryByText(/best available/)).not.toBeInTheDocument()
    expect(list.querySelectorAll('.recipe-thumb').length).toBe(3)
  })

  it('names the Leftover an alternative would leave, with the glossary word and a singular unit', () => {
    setup()
    expect(screen.getByText(/\+2 portion Leftover/)).toBeInTheDocument()
  })

  it('tapping a row picks that Recipe (swap and pin in one tap)', async () => {
    const { onPick } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Pizza' }))
    expect(onPick).toHaveBeenCalledWith(2)
  })

  it('"Keep it" is a tertiary button that closes the sheet', async () => {
    const { onClose } = setup()
    const keep = screen.getByRole('button', { name: 'Keep it' })
    expect(keep).toHaveAttribute('data-variant', 'tertiary')
    await userEvent.click(keep)
    expect(onClose).toHaveBeenCalled()
  })

  it('says so while loading and when nothing else fits', () => {
    const { rerender } = render(<SwapSheet open onClose={() => {}} slot={slot()} alternatives={[]} isLoading onPick={() => {}} />)
    expect(screen.getByText('Finding alternatives…')).toBeInTheDocument()
    rerender(<SwapSheet open onClose={() => {}} slot={slot()} alternatives={[]} isLoading={false} onPick={() => {}} />)
    expect(screen.getByText('No other Recipe fits this Meal Slot.')).toBeInTheDocument()
  })

  it('renders nothing while closed', () => {
    setup({ open: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

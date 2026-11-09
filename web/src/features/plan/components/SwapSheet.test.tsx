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
  alt(2, 'Pizza', { why: [{ code: 'slot_rule', tag: 'pizza' }, { code: 'favourite', members: ['Ben'] }] }),
  alt(3, 'Soup', { why: [{ code: 'best_available' }] }),
]

function setup(over: Partial<React.ComponentProps<typeof SwapSheet>> = {}) {
  const onPick = vi.fn()
  const onClose = vi.fn()
  render(
    <SwapSheet open onClose={onClose} slot={slot({ date: '2026-11-13' })} alternatives={alternatives} isLoading={false} onPick={onPick} {...over} />,
  )
  return { onPick, onClose }
}

describe('SwapSheet', () => {
  it('lists the three alternatives with their phrased why chips', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Swap this Planned Meal' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Choose / })).toHaveLength(3)
    expect(screen.getByText('carrots goes off Thu')).toBeInTheDocument()
    expect(screen.getByText('Slot Rule: Friday')).toBeInTheDocument() // the slot is on a Friday
    expect(screen.getByText("Ben's favourite")).toBeInTheDocument()
    expect(screen.getByText('best available')).toBeInTheDocument()
  })

  it('shows the Batches and the Leftover an alternative would leave', () => {
    setup()
    expect(screen.getByText('2 Batches')).toBeInTheDocument()
    expect(screen.getByText('+2 Leftover')).toBeInTheDocument()
  })

  it('choosing an alternative reports its Recipe', async () => {
    const { onPick } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Choose Pizza' }))
    expect(onPick).toHaveBeenCalledWith(2)
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

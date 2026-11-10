import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CookStep } from '../types'
import { StepTile } from './StepTile'

const step: CookStep = {
  index: 2,
  number: 2,
  of: 3,
  kind: 'passive',
  text: 'Simmer the stew',
  durationMinutes: 45,
  imageUrl: '',
  uses: [{ ingredientId: 1, ingredient: 'onion', quantity: 4, unit: 'piece' }],
  timer: { label: 'Step 2: Simmer the stew', durationSeconds: 2700 },
}

function tile(props: Partial<React.ComponentProps<typeof StepTile>> = {}) {
  const onBack = vi.fn()
  const onNext = vi.fn()
  render(<StepTile step={step} onBack={onBack} onNext={onNext} {...props} />)
  const el = screen.getByRole('article', { name: 'Step 2 of 3' })
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 400, right: 400, top: 0, bottom: 300, height: 300, x: 0, y: 0, toJSON: () => ({}) })
  return { el, onBack, onNext }
}

describe('StepTile', () => {
  it('shows the Step text and its scaled uses', () => {
    tile()
    expect(screen.getByText('Simmer the stew')).toBeInTheDocument()
    expect(screen.getByText(/^Uses/)).toHaveTextContent('Uses 4 piece onion')
  })

  it('says how long a Passive Step takes', () => {
    tile()
    expect(screen.getByText(/45 min/)).toBeInTheDocument()
  })

  it('uses the supplied formatter for the uses', () => {
    tile({ formatUse: (u) => `${u.quantity} x ${u.ingredient}` })
    expect(screen.getByText(/^Uses/)).toHaveTextContent('Uses 4 x onion')
  })

  it('tapping the left half goes back and the right half goes next', () => {
    const { el, onBack, onNext } = tile({ tapZones: true })
    fireEvent.click(el, { clientX: 100 })
    expect(onBack).toHaveBeenCalledTimes(1)
    fireEvent.click(el, { clientX: 300 })
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('does nothing on a tap when tap zones are off (phone)', () => {
    const { el, onBack, onNext } = tile({ tapZones: false })
    fireEvent.click(el, { clientX: 100 })
    fireEvent.click(el, { clientX: 300 })
    expect(onBack).not.toHaveBeenCalled()
    expect(onNext).not.toHaveBeenCalled()
  })

  it('puts every amount of the Step on one muted "Uses" line', () => {
    tile({
      step: { ...step, uses: [{ ingredientId: 1, ingredient: 'onion', quantity: 4, unit: 'piece' }, { ingredientId: 2, ingredient: 'flour', quantity: 250, unit: 'g' }] },
      formatUse: (u) => `${u.quantity} ${u.unit} ${u.ingredient}`,
    })
    expect(screen.getByText(/^Uses/)).toHaveTextContent('Uses 4 piece onion, 250 g flour')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('shows no Uses line for a Step without amounts', () => {
    tile({ step: { ...step, uses: [] } })
    expect(screen.queryByText(/^Uses/)).not.toBeInTheDocument()
  })

  it('has an overline naming the kind and the timer of a Passive Step', () => {
    tile()
    expect(screen.getByText('Passive · 45 min timer')).toBeInTheDocument()
  })

  it('tablet: shows two visible tap zones, Back on the left and Next on the right', () => {
    const { el } = tile({ tapZones: true })
    const zones = el.querySelectorAll('[data-zone]')
    expect([...zones].map((z) => z.getAttribute('data-zone'))).toEqual(['back', 'next'])
    zones.forEach((z) => expect(z).toHaveAttribute('aria-hidden', 'true'))
  })

  it('phone: shows no tap zones', () => {
    const { el } = tile({ tapZones: false })
    expect(el.querySelectorAll('[data-zone]')).toHaveLength(0)
  })

  it('shows the one-time coach mark on a tablet and dismisses it', async () => {
    const onCoachDismiss = vi.fn()
    const { onBack, onNext } = tile({ tapZones: true, coachMark: true, onCoachDismiss })
    expect(screen.getByText('Tap the right side for next, the left side for back')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(onCoachDismiss).toHaveBeenCalledTimes(1)
    expect(onBack).not.toHaveBeenCalled()
    expect(onNext).not.toHaveBeenCalled()
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
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
    expect(screen.getByRole('list')).toHaveTextContent('4 piece onion')
  })

  it('says how long a Passive Step takes', () => {
    tile()
    expect(screen.getByText(/45 min/)).toBeInTheDocument()
  })

  it('uses the supplied formatter for the uses', () => {
    tile({ formatUse: (u) => `${u.quantity} x ${u.ingredient}` })
    expect(screen.getByRole('list')).toHaveTextContent('4 x onion')
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
})

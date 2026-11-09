import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CookNavTiles } from './CookNavTiles'

const base = { isFirst: false, isLast: false, onBack: () => {}, onNext: () => {} }

describe('CookNavTiles', () => {
  it('has Back and Next that call their handlers', async () => {
    const onBack = vi.fn()
    const onNext = vi.fn()
    render(<CookNavTiles {...base} onBack={onBack} onNext={onNext} />)
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('disables Back on the first Step', () => {
    render(<CookNavTiles {...base} isFirst />)
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
  })

  it('offers Mark as Cooked instead of Next on the last Step of a Planned Meal', async () => {
    const onMarkCooked = vi.fn()
    render(<CookNavTiles {...base} isLast onMarkCooked={onMarkCooked} />)
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Mark as Cooked' }))
    expect(onMarkCooked).toHaveBeenCalledTimes(1)
  })

  it('offers Done on the last Step of a Recipe', async () => {
    const onDone = vi.fn()
    render(<CookNavTiles {...base} isLast onDone={onDone} />)
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('does not offer Mark as Cooked before the last Step', () => {
    render(<CookNavTiles {...base} onMarkCooked={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Mark as Cooked' })).not.toBeInTheDocument()
  })
})

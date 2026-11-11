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

  it('offers Back to Recipe (never "Done", a word for Cooked) on the last Step of a Recipe', async () => {
    const onDone = vi.fn()
    render(<CookNavTiles {...base} isLast onDone={onDone} />)
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Back to Recipe' }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('does not offer Mark as Cooked before the last Step', () => {
    render(<CookNavTiles {...base} onMarkCooked={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Mark as Cooked' })).not.toBeInTheDocument()
  })
})

describe('CookNavTiles: Next held by a timer', () => {
  it('disables Next and says why, linked as its description', () => {
    render(<CookNavTiles isFirst={false} isLast={false} onBack={() => {}} onNext={() => {}} heldText="Next waits for Step 1 · Pre-heat the oven: 4:12 left." />)
    const next = screen.getByRole('button', { name: 'Next' })
    expect(next).toBeDisabled()
    expect(next).toHaveAccessibleDescription('Next waits for Step 1 · Pre-heat the oven: 4:12 left.')
  })
  it('leaves the last Step\'s Mark as Cooked alone', () => {
    render(<CookNavTiles isFirst={false} isLast onBack={() => {}} onNext={() => {}} onMarkCooked={() => {}} heldText="held" />)
    expect(screen.getByRole('button', { name: 'Mark as Cooked' })).toBeEnabled()
    expect(screen.queryByText('held')).toBeNull()
  })
})

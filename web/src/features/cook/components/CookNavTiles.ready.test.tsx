// B9-45 (PC-05): on "Get ready" Back is disabled and Next reads "Start cooking".
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CookNavTiles } from './CookNavTiles'

describe('CookNavTiles on Get ready', () => {
  it('Next reads "Start cooking" (primary) and Back is disabled', async () => {
    const onNext = vi.fn()
    render(<CookNavTiles isFirst isLast={false} onBack={() => {}} onNext={onNext} nextLabel="Start cooking" />)
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    const start = screen.getByRole('button', { name: 'Start cooking' })
    expect(start).toHaveAttribute('data-variant', 'primary')
    await userEvent.click(start)
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('without a label it reads "Next"', () => {
    render(<CookNavTiles isFirst={false} isLast={false} onBack={() => {}} onNext={() => {}} />)
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
  })
})

// DS-SHOP (docs/design/system.md §3): "Includes Thu Dinner, not marked Cooked yet / Mark it" is said once, above the list, in the info colour.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { UnconfirmedNotice } from './UnconfirmedNotice'

const notice = {
  text: "Thu Dinner and Fri Lunch aren't marked Cooked yet",
  segments: [{ text: 'Thu Dinner', strong: true }, { text: ' and ' }, { text: 'Fri Lunch', strong: true }, { text: " aren't marked Cooked yet" }],
  count: 2,
  markIt: { date: '2026-11-05', mealSlotId: 3 },
}

describe('UnconfirmedNotice', () => {
  it('is a region named "Not marked Cooked yet" saying the sentence once, in an info status tile', () => {
    render(<UnconfirmedNotice notice={notice} onMarkIt={() => {}} />)
    const region = screen.getByRole('region', { name: 'Not marked Cooked yet' })
    expect(region).toHaveTextContent(notice.text)
    expect(region.closest('.tile') ?? region).toHaveAttribute('data-status', 'info')
    expect(region.closest('.tile') ?? region).toHaveAttribute('data-variant', 'status')
  })

  it('round 2: the slots are in bold (strong), the rest is plain text, and the sentence is clamped to two lines', () => {
    render(<UnconfirmedNotice notice={notice} onMarkIt={() => {}} />)
    const region = screen.getByRole('region', { name: 'Not marked Cooked yet' })
    expect([...region.querySelectorAll('strong')].map((s) => s.textContent)).toEqual(['Thu Dinner', 'Fri Lunch'])
    expect(region.querySelector('.shop-notice__text')).toHaveAttribute('title', notice.text)
  })

  it('"Mark it" calls back with the oldest slot to mark', async () => {
    const onMarkIt = vi.fn()
    render(<UnconfirmedNotice notice={notice} onMarkIt={onMarkIt} />)
    await userEvent.click(screen.getByRole('button', { name: 'Mark it' }))
    expect(onMarkIt).toHaveBeenCalledExactlyOnceWith(notice.markIt)
  })

  it('"Mark it" is a secondary action: the accent is for Scan only', () => {
    render(<UnconfirmedNotice notice={notice} onMarkIt={() => {}} />)
    expect(screen.getByRole('button', { name: 'Mark it' })).not.toHaveAttribute('data-variant', 'primary')
  })

  it('without onMarkIt it is only the sentence', () => {
    render(<UnconfirmedNotice notice={notice} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

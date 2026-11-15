// B9-43 (SSP-04; mocks/ssp-04-notice.html): "Not marked Cooked yet" is the notice's title with a count chip; the slots are a meta line under
// it (it may clamp to two lines; the verb never does); Mark it is a secondary button. The tile is a section named by its title.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { UnconfirmedNotice } from './UnconfirmedNotice'

const notice = {
  title: 'Not marked Cooked yet',
  slots: [{ text: 'Sat Breakfast, Sat Lunch and Sat Dinner' }],
  count: 3,
  markIt: { date: '2026-11-07', mealSlotId: 1 },
  // the retired sentence form, still on the type until the developer removes it: the component must not use it
  text: 'old sentence that must not be shown',
  segments: [{ text: 'old sentence that must not be shown' }],
}
const region = () => screen.getByRole('region', { name: /^Not marked Cooked yet/ })

describe('UnconfirmedNotice', () => {
  it('is a section named by its title (aria-labelledby), in an info status tile', () => {
    render(<UnconfirmedNotice notice={notice} onMarkIt={() => {}} />)
    const tile = region().closest('.tile') ?? region()
    expect(tile).toHaveAttribute('data-variant', 'status')
    expect(tile).toHaveAttribute('data-status', 'info')
    expect(region().tagName).toBe('SECTION')
    const title = region().querySelector('.shop-notice__title')!
    expect(region().getAttribute('aria-labelledby')).toBe(title.id)
    expect(title.id).not.toBe('')
  })

  it('says the predicate first: the title "Not marked Cooked yet" comes before the slots', () => {
    render(<UnconfirmedNotice notice={notice} onMarkIt={() => {}} />)
    const title = region().querySelector('.shop-notice__title')!
    const slots = region().querySelector('.shop-notice__slots')!
    expect(title).toHaveTextContent('Not marked Cooked yet')
    expect(slots).toHaveTextContent('Sat Breakfast, Sat Lunch and Sat Dinner')
    expect(title.compareDocumentPosition(slots) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(region()).not.toHaveTextContent('old sentence')
  })

  it('the count is a chip beside the title, with a visually hidden " Meal Slots to mark"', () => {
    render(<UnconfirmedNotice notice={notice} onMarkIt={() => {}} />)
    const count = region().querySelector('.shop-notice__count')!
    expect(count).toHaveTextContent('3')
    expect(count.closest('.shop-notice__title')).not.toBeNull()
    const hidden = count.querySelector('.visually-hidden') ?? count.parentElement!.querySelector('.visually-hidden')
    expect(hidden).toHaveTextContent('Meal Slots to mark')
  })

  it('one Meal Slot to mark reads "Meal Slot to mark" (singular)', () => {
    render(<UnconfirmedNotice notice={{ ...notice, count: 1, slots: [{ text: 'Tue Dinner' }] }} onMarkIt={() => {}} />)
    expect(region().querySelector('.visually-hidden')).toHaveTextContent(/Meal Slot to mark/)
    expect(region().querySelector('.visually-hidden')).not.toHaveTextContent('Meal Slots')
  })

  it('nothing in the notice is set bold, and it has no title attribute standing in for text a touch screen cannot show', () => {
    render(<UnconfirmedNotice notice={notice} onMarkIt={() => {}} />)
    expect(region().querySelector('strong, b')).toBeNull()
    expect(region().querySelector('[title]')).toBeNull()
  })

  it('"Mark it" calls back with the oldest slot to mark, and is a secondary button (the accent is for Scan only)', async () => {
    const onMarkIt = vi.fn()
    render(<UnconfirmedNotice notice={notice} onMarkIt={onMarkIt} />)
    const button = within(region()).getByRole('button', { name: 'Mark it' })
    expect(button).toHaveAttribute('data-variant', 'secondary')
    await userEvent.click(button)
    expect(onMarkIt).toHaveBeenCalledExactlyOnceWith(notice.markIt)
  })

  it('without onMarkIt it is the title and the slots only', () => {
    render(<UnconfirmedNotice notice={notice} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

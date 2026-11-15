// B9-40 (PC-03, PC-16 items 1 and 4, SHORT-01 decision SHORT 3): the Step tile. The Step count lives in the overline, the text size follows its
// length, numbers keep their units, the planned time is a labelled meta line, the photo opens in a dialog, and tap zones work on every width.
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CookStep } from '../types'
import { StepTile } from './StepTile'

const NB = ' '
const step: CookStep = {
  index: 1, number: 2, of: 5, kind: 'active', text: 'Pre-heat the oven to 220 °C.', durationMinutes: 2, imageUrl: '', uses: [], timer: null,
}
const LONG = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ')

function tile(props: Partial<React.ComponentProps<typeof StepTile>> = {}, over: Partial<CookStep> = {}) {
  const onBack = vi.fn()
  const onNext = vi.fn()
  render(<StepTile step={{ ...step, ...over }} onBack={onBack} onNext={onNext} {...props} />)
  const el = screen.getByRole('article', { name: /^Step \d+ of \d+$/ })
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 400, right: 400, top: 0, bottom: 300, height: 300, x: 0, y: 0, toJSON: () => ({}) })
  return { el, onBack, onNext }
}

describe('StepTile overline (PC-03: the Step count moves into the overline)', () => {
  it('reads "Step 2 of 5 · Active · 2 min" and is announced as a status when the Step changes', () => {
    const { el } = tile()
    const overline = within(el).getByRole('status')
    expect(overline).toHaveTextContent('Step 2 of 5 · Active · 2 min')
    expect(overline).toHaveClass('tile__overline')
  })
  it('a Passive Step of 6 hours reads "Step 2 of 4 · Passive · 6 h timer" (PC-16 item 3)', () => {
    const { el } = tile({}, { number: 2, of: 4, kind: 'passive', durationMinutes: 360, timer: { label: 'x', durationSeconds: 21600 } })
    expect(within(el).getByRole('status')).toHaveTextContent('Step 2 of 4 · Passive · 6 h timer')
  })
})

describe('StepTile text (PC-03 length rule, PC-16 item 1)', () => {
  it('a short Step is data-length="short", a long one (over 25 words) "long"', () => {
    tile()
    expect(screen.getByText(/Pre-heat the oven/)).toHaveAttribute('data-length', 'short')
  })
  it('a long Step is data-length="long"', () => {
    tile({}, { text: LONG })
    expect(screen.getByText(/^word0 /)).toHaveAttribute('data-length', 'long')
  })
  it('joins "220 °C" with a no-break space so it never breaks between the number and the unit', () => {
    tile()
    expect(screen.getByText(/Pre-heat the oven/).textContent).toBe(`Pre-heat the oven to 220${NB}°C.`)
  })
})

describe('StepTile planned time (PC-16 item 4: "Start at 18:30" with a Clock icon)', () => {
  it('is a meta line with the time labelled and a decorative clock icon', () => {
    const { el } = tile({ clock: '18:30' })
    const line = el.querySelector('.cook-step__clock')!
    expect(line).toHaveTextContent('Start at 18:30')
    expect(line.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
  it('is left out without a clock (a one-Course tile is as before)', () => {
    const { el } = tile()
    expect(el.querySelector('.cook-step__clock')).toBeNull()
  })
})

describe('StepTile photo (PC-03: capped; Enlarge opens a full-screen dialog)', () => {
  const photo = { imageUrl: '/img/step-2.jpg' }
  it('shows the photo in a figure with an "Enlarge the photo" button', () => {
    const { el } = tile({}, photo)
    expect(el.querySelector('figure.cook-step__photo img.cook-step__image')).not.toBeNull()
    expect(within(el).getByRole('button', { name: 'Enlarge the photo' })).toBeInTheDocument()
  })
  it('has no figure and no button for a Step without a photo', () => {
    const { el } = tile()
    expect(el.querySelector('figure')).toBeNull()
    expect(within(el).queryByRole('button', { name: 'Enlarge the photo' })).not.toBeInTheDocument()
  })
  it('Enlarge opens a dialog named "Step 2 photo" with the whole photo and one Close; Close and Escape shut it', async () => {
    const { el } = tile({}, photo)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(within(el).getByRole('button', { name: 'Enlarge the photo' }))
    const dialog = await screen.findByRole('dialog', { name: 'Step 2 photo' })
    expect(dialog.querySelector('img')).toHaveAttribute('src', '/img/step-2.jpg')
    expect(within(dialog).getAllByRole('button', { name: 'Close' })).toHaveLength(1)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(within(el).getByRole('button', { name: 'Enlarge the photo' }))
    await screen.findByRole('dialog', { name: 'Step 2 photo' })
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('a tap on the Enlarge button does not turn the Step (a button inside the tile is left to itself)', async () => {
    const { el, onNext, onBack } = tile({ tapZones: true }, photo)
    await userEvent.click(within(el).getByRole('button', { name: 'Enlarge the photo' }))
    expect(onNext).not.toHaveBeenCalled()
    expect(onBack).not.toHaveBeenCalled()
  })
})

describe('StepTile tap zones (decision SHORT 3: on phones too)', () => {
  it('Scenario: Tapping the right half of the Step tile on a phone goes to the next Step', () => {
    // The screen passes tapZones at every width; the tile itself does not look at the viewport (jsdom has no matchMedia here).
    const { el, onBack, onNext } = tile({ tapZones: true })
    fireEvent.pointerDown(el, { clientX: 300, clientY: 100, pointerId: 1 })
    fireEvent.click(el, { clientX: 301, clientY: 102 })
    expect(onNext).toHaveBeenCalledTimes(1)
    fireEvent.pointerDown(el, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.click(el, { clientX: 100, clientY: 100 })
    expect(onBack).toHaveBeenCalledTimes(1)
  })
  it('Scenario: Scrolling a long Step on a phone does not change the Step', () => {
    const { el, onBack, onNext } = tile({ tapZones: true }, { text: LONG })
    // A finger that moved 60 px up the page before it came off is a scroll, whichever half it started in.
    fireEvent.pointerDown(el, { clientX: 300, clientY: 200, pointerId: 1 })
    fireEvent.click(el, { clientX: 300, clientY: 140 })
    fireEvent.pointerDown(el, { clientX: 100, clientY: 200, pointerId: 1 })
    fireEvent.click(el, { clientX: 100, clientY: 260 })
    expect(onNext).not.toHaveBeenCalled()
    expect(onBack).not.toHaveBeenCalled()
  })
  it('a click with no pointer press before it (a keyboard or assistive click) still counts as a tap by its position', () => {
    const { el, onNext } = tile({ tapZones: true })
    fireEvent.click(el, { clientX: 300, clientY: 100 })
    expect(onNext).toHaveBeenCalledTimes(1)
  })
  it('the first tap on a zone calls onCoachDismiss, so the coach mark shows once per device (PC-16 item 1)', () => {
    const onCoachDismiss = vi.fn()
    const { el } = tile({ tapZones: true, coachMark: true, onCoachDismiss })
    fireEvent.click(el, { clientX: 300, clientY: 100 })
    expect(onCoachDismiss).toHaveBeenCalledTimes(1)
  })
  it('the visible zones carry a chevron each, hidden from assistive technology', () => {
    const { el } = tile({ tapZones: true })
    const zones = [...el.querySelectorAll('[data-zone]')]
    expect(zones.map((z) => z.getAttribute('data-zone'))).toEqual(['back', 'next'])
    zones.forEach((z) => expect(z).toHaveAttribute('aria-hidden', 'true'))
  })
})

// B9-19 (SHORT-04, known item from earlier reviews): a focused control under the sticky Save bar is scrolled into view. On the Recipe
// editor at 375-390 px, tabbing into a Step text or the Description left the textarea's bottom under the bar: scroll-padding cannot
// help (the browser scrolls the caret, not the box, and does not scroll a control that is already partly visible). The bar listens
// for focusin and calls scrollIntoView({ block: 'nearest' }) on the field frame when the frame's ring box crosses the bar's top;
// scroll-padding-block-end (the bar, its gap, the ring) then decides where it stops.
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Button } from './Button'
import { FormActions } from './FormActions'
import { StickyActionBar } from './StickyActionBar'
import { ringCrossesBarTop } from './useStickyBarClearance'

describe('ringCrossesBarTop (pure)', () => {
  it('is true when the field frame grown by its ring reaches below the bar top', () => {
    expect(ringCrossesBarTop({ frameBottom: 600, ring: 5, barTop: 602 })).toBe(true) // 605 > 602
    expect(ringCrossesBarTop({ frameBottom: 700, ring: 5, barTop: 602 })).toBe(true) // wholly under the bar
  })
  it('is false when the ring box ends at or above the bar top', () => {
    expect(ringCrossesBarTop({ frameBottom: 597, ring: 5, barTop: 602 })).toBe(false) // 602 is touching, not crossing
    expect(ringCrossesBarTop({ frameBottom: 400, ring: 5, barTop: 602 })).toBe(false)
  })
  it('the ring defaults to 5 px (3 px outline + 2 px offset)', () => {
    expect(ringCrossesBarTop({ frameBottom: 598, barTop: 602 })).toBe(true)
    expect(ringCrossesBarTop({ frameBottom: 597, barTop: 602 })).toBe(false)
  })
})

let scrollIntoView: ReturnType<typeof vi.fn>
beforeEach(() => {
  scrollIntoView = vi.fn()
  Element.prototype.scrollIntoView = scrollIntoView as unknown as Element['scrollIntoView']
})
afterEach(() => {
  vi.restoreAllMocks()
  // jsdom has no scrollIntoView of its own
  delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView
})

const rect = (top: number, bottom: number): DOMRect => ({ top, bottom, left: 0, right: 300, width: 300, height: bottom - top, x: 0, y: top, toJSON() {} }) as DOMRect

function page(frameBottom: number, barTop = 600) {
  const utils = render(
    <>
      <div className="ui-field__control" data-testid="frame">
        <textarea aria-label="Step text" />
      </div>
      <input aria-label="Outside any frame" />
      <StickyActionBar>
        <FormActions tertiary={<Button variant="secondary">Cancel</Button>} primary={<Button>Save</Button>} />
      </StickyActionBar>
    </>,
  )
  vi.spyOn(utils.getByTestId('frame'), 'getBoundingClientRect').mockReturnValue(rect(frameBottom - 120, frameBottom))
  vi.spyOn(utils.container.querySelector('.sticky-action-bar')!, 'getBoundingClientRect').mockReturnValue(rect(barTop, barTop + 70))
  return utils
}

describe('StickyActionBar scrolls a field frame clear when focus puts its ring under the bar', () => {
  it('calls scrollIntoView({ block: "nearest" }) on the field frame, not on the textarea', async () => {
    const { getByLabelText, getByTestId } = page(640)
    await userEvent.click(getByLabelText('Step text'))
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    expect(scrollIntoView.mock.contexts[0]).toBe(getByTestId('frame'))
  })

  it('does nothing while the ring box stays above the bar', async () => {
    const { getByLabelText } = page(560)
    await userEvent.click(getByLabelText('Step text'))
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('a field without a frame scrolls the control itself', async () => {
    const { getByLabelText } = page(560)
    const outside = getByLabelText('Outside any frame')
    vi.spyOn(outside, 'getBoundingClientRect').mockReturnValue(rect(580, 640))
    await userEvent.click(outside)
    expect(scrollIntoView.mock.contexts[0]).toBe(outside)
  })

  it('focus inside the bar itself never scrolls (Cancel and Save are the bar)', async () => {
    const { getByRole } = page(640)
    await userEvent.click(getByRole('button', { name: 'Save' }))
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('stops listening when the bar unmounts', async () => {
    const { getByLabelText, rerender } = page(640)
    rerender(
      <>
        <div className="ui-field__control">
          <textarea aria-label="Step text" />
        </div>
      </>,
    )
    await userEvent.click(getByLabelText('Step text'))
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})

describe('StickyActionBar re-checks the focused field when the keyboard comes up (B9-19 developer)', () => {
  it('a visual-viewport resize after the focus scrolls the frame clear when the bar has ridden up over it', async () => {
    const listeners: (() => void)[] = []
    vi.stubGlobal('visualViewport', { height: 844, offsetTop: 0, addEventListener: (_t: string, cb: () => void) => listeners.push(cb), removeEventListener: () => {} })
    const { getByLabelText, getByTestId, container } = page(560)
    await userEvent.click(getByLabelText('Step text'))
    expect(scrollIntoView).not.toHaveBeenCalled()
    vi.spyOn(container.querySelector('.sticky-action-bar')!, 'getBoundingClientRect').mockReturnValue(rect(400, 470))
    listeners.forEach((cb) => cb())
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts[0]).toBe(getByTestId('frame'))
    vi.unstubAllGlobals()
  })
})

describe('StickyActionBar scrolls a Checkbox clear by its visible box (B9-19 developer, P39 on the Recipe editor at 1440)', () => {
  it('a visually hidden input (opacity 0) is measured and scrolled by the box beside it that draws its ring', async () => {
    const { container, getByRole } = render(
      <>
        <label className="checkbox__control">
          <input type="checkbox" className="checkbox__input" style={{ opacity: 0 }} aria-label="Ready Meal" />
          <span className="checkbox__box" data-testid="box" />
        </label>
        <StickyActionBar>
          <FormActions primary={<Button>Save</Button>} />
        </StickyActionBar>
      </>,
    )
    const box = container.querySelector('.checkbox__box')!
    vi.spyOn(box, 'getBoundingClientRect').mockReturnValue(rect(580, 604))
    vi.spyOn(container.querySelector('.checkbox__input')!, 'getBoundingClientRect').mockReturnValue(rect(500, 501))
    vi.spyOn(container.querySelector('.sticky-action-bar')!, 'getBoundingClientRect').mockReturnValue(rect(600, 670))
    await userEvent.click(getByRole('checkbox', { name: 'Ready Meal' }))
    expect(scrollIntoView.mock.contexts[0]).toBe(box)
  })
})

describe('a ring that only touches the bar is scrolled clear too (B9-19 developer, P39 counts touching)', () => {
  it('a frame whose ring ends exactly on the bar top, or within the 4 px gap, is scrolled', async () => {
    const { getByLabelText } = page(595, 600) // 595 + 5 = 600: touching
    await userEvent.click(getByLabelText('Step text'))
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })
  it('a frame whose ring ends 4 px or more above the bar is left where it is', async () => {
    const { getByLabelText } = page(591, 600) // 591 + 5 + 4 = 600
    await userEvent.click(getByLabelText('Step text'))
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})

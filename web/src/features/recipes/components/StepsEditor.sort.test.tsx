// Sort-drag: Steps take a drag handle; Move Step up/down in the actions menu stays (docs/dev/design/sort-drag.md section 6.2).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { layoutRows, pointer } from '../../../ui/Sortable/sortable.test-helper'
import { flour, garlic } from '../fixtures.test-helper'

vi.mock('../../../ui', async (orig) => ({
  ...(await orig<object>()),
  ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker,
}))

import type { StepDraft } from '../lib/draft'
import { StepsEditor } from './StepsEditor'

const step = (over: Partial<StepDraft> = {}): StepDraft => ({
  key: 'k', text: 'Chop', kind: 'active', durationMinutes: '5', leadTimeMinutes: '', after: [], uses: [], image: '', ...over,
})
const three = () => [
  step({ key: 'a', text: 'one' }),
  step({ key: 'b', text: 'two', after: [0] }),
  step({ key: 'c', text: 'three', after: [1] }),
]

let latest: StepDraft[] = []
function Harness({ initial }: { initial: StepDraft[] }) {
  const [steps, setSteps] = useState(initial)
  latest = steps
  return <StepsEditor steps={steps} errors={{}} onChange={setSteps} ingredients={[garlic, flour]} />
}
const cards = () => screen.getAllByRole('listitem').filter((li) => li.matches('ol > li'))
const texts = () => cards().map((c) => (within(c).getByRole('textbox', { name: 'Step text' }) as HTMLTextAreaElement).value)
const numbers = () => cards().map((c) => c.querySelector('[data-step-number]')!.textContent)

beforeEach(() => {
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
})

describe('StepsEditor: drag handles', () => {
  it('every Step card has a handle "Reorder Step N" in its head, with the shared instructions', () => {
    render(<Harness initial={three()} />)
    for (const [i, card] of cards().entries()) {
      const handle = within(card).getByRole('button', { name: `Reorder Step ${i + 1}` })
      expect(card.querySelector('.step-card__head')).toContainElement(handle)
      expect(handle).toHaveAccessibleDescription(/Press Space to pick up/)
    }
  })
  it('a sole Step still shows its handle (it may be the first of many soon) but cannot be moved', async () => {
    render(<Harness initial={[step({ key: 'a', text: 'only' })]} />)
    const handle = screen.getByRole('button', { name: 'Reorder Step 1' })
    handle.focus()
    await userEvent.keyboard(' {ArrowDown}')
    expect(screen.getByRole('status')).toHaveTextContent('Step 1 is already last.')
  })
  it('the Steps are a list the live region belongs to', () => {
    render(<Harness initial={three()} />)
    expect(screen.getAllByRole('status').some((s) => s.className.includes('sortable__live'))).toBe(true)
  })
})

describe('StepsEditor: keyboard reorder', () => {
  it('Space, ArrowUp, Space moves Step 2 to the top and renumbers the badges', async () => {
    render(<Harness initial={three()} />)
    screen.getByRole('button', { name: 'Reorder Step 2' }).focus()
    await userEvent.keyboard(' {ArrowUp} ')
    expect(texts()).toEqual(['two', 'one', 'three'])
    expect(numbers()).toEqual(['1', '2', '3'])
  })
  it('goes through lib/steps.moveStep: "after" follows the Steps it pointed at and never points forward', async () => {
    render(<Harness initial={three()} />)
    screen.getByRole('button', { name: 'Reorder Step 2' }).focus()
    await userEvent.keyboard(' {ArrowUp} ')
    // b was after a; now b is first, so it waits for nothing. c waited for b, which is now Step 1 (index 0).
    expect(latest.map((s) => s.key)).toEqual(['b', 'a', 'c'])
    expect(latest.map((s) => s.after)).toEqual([[], [], [0]])
  })
  it('Escape leaves the Steps untouched', async () => {
    render(<Harness initial={three()} />)
    screen.getByRole('button', { name: 'Reorder Step 3' }).focus()
    await userEvent.keyboard(' {ArrowUp}{Escape}')
    expect(texts()).toEqual(['one', 'two', 'three'])
    expect(latest.map((s) => s.after)).toEqual([[], [0], [1]])
  })
  it('shows the preview order while lifted without calling onChange until the drop', async () => {
    const onChange = vi.fn()
    render(<StepsEditor steps={three()} errors={{}} onChange={onChange} ingredients={[garlic]} />)
    screen.getByRole('button', { name: 'Reorder Step 1' }).focus()
    await userEvent.keyboard(' {ArrowDown}')
    expect(onChange).not.toHaveBeenCalled()
    await userEvent.keyboard(' ')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]![0].map((s: StepDraft) => s.key)).toEqual(['b', 'a', 'c'])
  })
})

describe('StepsEditor: after-chips while a Step is lifted', () => {
  it('name the Steps by the positions shown in the preview, matching the badges', async () => {
    render(<Harness initial={three()} />)
    const chipNames = (card: HTMLElement) => within(card).getAllByRole('button', { name: /^After step/ }).map((b) => b.textContent)
    const two = () => cards().find((c) => (within(c).getByRole('textbox', { name: 'Step text' }) as HTMLTextAreaElement).value === 'two')!
    expect(chipNames(two())).toEqual(['After step 1'])
    screen.getByRole('button', { name: 'Reorder Step 3' }).focus()
    await userEvent.keyboard(' {ArrowUp}{ArrowUp}')
    // Preview: three, one, two. Step "one" is now shown as Step 2.
    expect(numbers()).toEqual(['1', '2', '3'])
    expect(chipNames(two())).toEqual(['After step 2'])
  })
})

describe('StepsEditor: pointer reorder', () => {
  it('dragging the handle of Step 1 below Step 3 reorders on release', () => {
    const { container } = render(<Harness initial={three()} />)
    layoutRows(container)
    const handle = screen.getByRole('button', { name: 'Reorder Step 1' })
    pointer(handle, 'pointerdown', { clientY: 25 })
    pointer(handle, 'pointermove', { clientY: 130 })
    pointer(handle, 'pointerup', { clientY: 130 })
    expect(texts()).toEqual(['two', 'three', 'one'])
    expect(latest.map((s) => s.after)).toEqual([[], [0], []]) // one is Advance-free here: a Step only waits for earlier ones
  })
  it('a cancelled drag changes nothing', () => {
    const { container } = render(<Harness initial={three()} />)
    layoutRows(container)
    const handle = screen.getByRole('button', { name: 'Reorder Step 1' })
    pointer(handle, 'pointerdown', { clientY: 25 })
    pointer(handle, 'pointermove', { clientY: 130 })
    pointer(handle, 'pointercancel', { clientY: 130 })
    expect(texts()).toEqual(['one', 'two', 'three'])
  })
})

describe('StepsEditor: the actions menu is still the accessible fallback', () => {
  it('Move Step down in the menu still reorders, next to the handle', async () => {
    render(<Harness initial={three()} />)
    await userEvent.click(within(cards()[0]!).getByRole('button', { name: 'Step actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move Step down' }))
    expect(texts()).toEqual(['two', 'one', 'three'])
  })
  it('Remove Step is still there', () => {
    render(<Harness initial={three()} />)
    expect(within(cards()[0]!).getByRole('button', { name: 'Remove Step' })).toBeInTheDocument()
  })
})

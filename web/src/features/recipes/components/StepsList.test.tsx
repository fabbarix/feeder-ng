// RX-04: a Step is an R-E row: number badge; the Step text is the key; its time is the state at the end ("10 min", "12 h before", "No time" in muted
// for an untimed Step); the muted detail has the kind icon and kind, plus "Uses ..." or "After Step 2"; the Step photo (72 px) under it.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { garlic, recipe } from '../fixtures.test-helper'
import type { RecipeStep } from '../types'
import { StepsList } from './StepsList'

const steps = recipe().steps
const refs = new Map([[7, garlic]])
const items = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('ol.steps-list > li.steps-list__item'))
const step = (over: Partial<RecipeStep> = {}): RecipeStep => ({ text: 'Stir', kind: 'active', durationMinutes: 0, leadTimeMinutes: 0, after: [], uses: [], image: '', ...over })

describe('StepsList: rows', () => {
  it('is an ordered list: a row per Step with a number badge', () => {
    const { container } = render(<StepsList steps={steps} refs={refs} />)
    expect(items(container)).toHaveLength(2)
    expect(screen.getByText('2', { selector: '[data-step-number]' })).toBeInTheDocument()
    expect(screen.getByText('Roast')).toHaveClass('steps-list__text')
  })
  it('puts the time at the end of the row, not in the muted detail', () => {
    const { container } = render(<StepsList steps={steps} refs={refs} />)
    const [first, second] = items(container)
    expect(first!.querySelector('.steps-list__time')).toHaveTextContent('4 h before')
    expect(second!.querySelector('.steps-list__time')).toHaveTextContent('40 min')
    expect(first!.querySelector('.steps-list__detail')).toHaveTextContent(/^Advance Step$/)
    expect(second!.querySelector('.steps-list__detail')).toHaveTextContent('Passive · Uses 2 clove garlic')
    // the time is the last thing in the DOM of the row, after the body
    expect(second!.lastElementChild).toHaveClass('steps-list__time')
  })
  it('says "No time" in muted for an untimed Step, and flags it', () => {
    const { container } = render(<StepsList steps={[step(), step({ text: 'Rest', kind: 'passive', durationMinutes: 10 })]} refs={refs} />)
    const [untimed, timed] = items(container)
    expect(untimed!.querySelector('.steps-list__time')).toHaveTextContent('No time')
    expect(untimed!.querySelector('.steps-list__time')).toHaveAttribute('data-untimed', 'true')
    expect(timed!.querySelector('.steps-list__time')).not.toHaveAttribute('data-untimed', 'true')
  })
  it('names the Steps a Step comes after in its detail: "Passive · After Step 2"', () => {
    const { container } = render(<StepsList steps={[step(), step({ text: 'B' }), step({ text: 'Simmer', kind: 'passive', durationMinutes: 25, after: [1] })]} refs={refs} />)
    expect(items(container)[2]!.querySelector('.steps-list__detail')).toHaveTextContent('Passive · After Step 2')
  })
  it('has the kind icon in the detail, hidden from assistive technology', () => {
    const { container } = render(<StepsList steps={steps} refs={refs} />)
    const icon = items(container)[0]!.querySelector('.steps-list__detail svg')
    expect(icon).not.toBeNull()
    expect(icon).toHaveAttribute('aria-hidden', 'true')
  })
  it('shows the Step photo under the text at a bounded size', () => {
    const { container } = render(<StepsList steps={steps} refs={refs} />)
    const img = container.querySelector('img')!
    expect(img).toHaveAttribute('src', '/api/images/abc')
    expect(img.closest('.recipe-thumb')).not.toBeNull()
    const body = items(container)[1]!.querySelector('.steps-list__body') as HTMLElement
    expect(within(body).getByText('Roast')).toBeInTheDocument()
    expect(body.querySelector('.steps-list__photo')).not.toBeNull()
  })
  it('no longer prints the kind and time as one meta line, nor "Uses" as its own paragraph', () => {
    const { container } = render(<StepsList steps={steps} refs={refs} />)
    expect(screen.queryByText('Passive · 40 min')).toBeNull()
    expect(screen.queryByText('Advance Step · 4 h before')).toBeNull()
    expect(container.querySelector('.steps-list__meta, .steps-list__uses')).toBeNull()
  })
})

// B9-14 / A11Y-07 "a sheet changes step": `focusStepStart(root)` focuses the new step's heading, and
// `useFocusStepStart(rootRef, stepKey)` calls it when stepKey changes (not on the first render: opening is useModalDialog's).
// The heading is the first [data-step-heading], else the first h2 or h3 of the root, given tabIndex -1; no ring is drawn on it.
import { render } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it } from 'vitest'
import { focusStepStart, useFocusStepStart } from './focusStepStart'
import { readUiCss } from '../test-utils'

describe('focusStepStart', () => {
  it('focuses the first h2/h3 of the step, giving it tabIndex -1', () => {
    const { container } = render(
      <div>
        <button>Earlier</button>
        <h3>Which Lines?</h3>
        <button>Next</button>
      </div>,
    )
    const heading = focusStepStart(container)
    expect(heading).toBe(container.querySelector('h3'))
    expect(heading).toHaveFocus()
    expect(heading).toHaveAttribute('tabindex', '-1')
  })
  it('prefers [data-step-heading] over an h2', () => {
    const { container } = render(
      <div>
        <h2>Sheet title</h2>
        <p data-step-heading>Step two</p>
      </div>,
    )
    expect(focusStepStart(container)).toBe(container.querySelector('[data-step-heading]'))
  })
  it('returns null and moves nothing when the step has no heading', () => {
    const { container } = render(
      <div>
        <button>Only</button>
      </div>,
    )
    ;(container.querySelector('button') as HTMLElement).focus()
    expect(focusStepStart(container)).toBeNull()
    expect(container.querySelector('button')).toHaveFocus()
  })
  it('a focused heading draws no ring (the sheet and page stylesheets set outline none on tabindex -1)', () => {
    const css = readUiCss('BottomSheet.css') + readUiCss('Dialog.css')
    expect(css).toMatch(/\.sheet__title:focus\s*\{\s*outline:\s*none/)
    expect(css).toMatch(/(\[data-step-heading\]|\[tabindex=['"]-1['"]\]):focus[^{]*\{[^}]*outline:\s*none/)
  })
})

function Steps({ step }: { step: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusStepStart(ref, step)
  return (
    <div ref={ref}>
      <button>Control</button>
      <h3 key={step}>Step {step}</h3>
    </div>
  )
}

describe('useFocusStepStart', () => {
  it('does not move focus on the first render', () => {
    const { container } = render(<Steps step="one" />)
    expect(container.querySelector('h3')).not.toHaveFocus()
  })
  it('moves focus to the new step heading when the step changes', () => {
    const { container, rerender } = render(<Steps step="one" />)
    rerender(<Steps step="two" />)
    expect(container.querySelector('h3')).toHaveTextContent('Step two')
    expect(container.querySelector('h3')).toHaveFocus()
  })
  it('does not move focus when a rerender keeps the same step', () => {
    const { container, rerender } = render(<Steps step="one" />)
    container.querySelector('button')!.focus()
    rerender(<Steps step="one" />)
    expect(container.querySelector('button')).toHaveFocus()
  })
})

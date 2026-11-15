// Batch w3e: an action row that wraps is marked data-stacked (Dialog.css stacks it full width, the decision on top).
import { describe, expect, it } from 'vitest'
import { stylesheet, rule } from '../../test/cssRules'
import { measureStacked } from './useStackedActions'

function row(tops: number[]): HTMLElement {
  const el = document.createElement('div')
  for (const t of tops) {
    const b = document.createElement('button')
    Object.defineProperty(b, 'offsetTop', { value: t })
    el.append(b)
  }
  return el
}

describe('measureStacked', () => {
  it('marks a row whose buttons wrap', () => {
    const r = row([0, 52])
    expect(measureStacked(r)).toBe(true)
    expect(r).toHaveAttribute('data-stacked')
  })
  it('leaves a row that fits on one line, and clears an old mark', () => {
    const r = row([0, 0])
    r.setAttribute('data-stacked', '')
    expect(measureStacked(r)).toBe(false)
    expect(r).not.toHaveAttribute('data-stacked')
  })
  it('Dialog.css stacks a marked row full width with the decision (last) on top', () => {
    const { base } = stylesheet('src/ui/Dialog.css')
    expect(rule(base, '.dialog__actions[data-stacked]')).toMatchObject({ 'flex-direction': 'column-reverse', 'align-items': 'stretch' })
  })
})

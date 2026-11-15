// B9-19 (A11Y-01): useDocumentTitle joins the defined parts and "Feeder" with " · " (U+00B7 with spaces). It is plain: no restore on
// unmount, the next page sets its own title.
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { documentTitle, useDocumentTitle } from './useDocumentTitle'

function Title({ parts }: { parts: (string | undefined)[] }) {
  useDocumentTitle(parts)
  return null
}
afterEach(() => {
  document.title = ''
})

describe('documentTitle (pure)', () => {
  it('joins the parts and the app name with " · "', () => {
    expect(documentTitle(['Pasta al pomodoro', 'Recipes'])).toBe('Pasta al pomodoro · Recipes · Feeder')
    expect(documentTitle(['Plan'])).toBe('Plan · Feeder')
  })

  it('drops undefined parts, and empty or blank ones', () => {
    expect(documentTitle(['Plan', undefined])).toBe('Plan · Feeder')
    expect(documentTitle([undefined, 'Flour', undefined, 'Ingredients'])).toBe('Flour · Ingredients · Feeder')
    expect(documentTitle(['', '  ', 'Shop'])).toBe('Shop · Feeder')
  })

  it('no parts is just "Feeder"', () => {
    expect(documentTitle([])).toBe('Feeder')
    expect(documentTitle([undefined])).toBe('Feeder')
  })

  it('the separator is U+00B7 with a space each side', () => {
    expect(documentTitle(['A'])).toBe('A ·'.replace(' ', ' ') + ' Feeder')
  })
})

describe('useDocumentTitle', () => {
  it('sets document.title on mount', () => {
    render(<Title parts={['Members', 'Settings']} />)
    expect(document.title).toBe('Members · Settings · Feeder')
  })

  it('follows a change of the parts', () => {
    const { rerender } = render(<Title parts={['Recipes']} />)
    expect(document.title).toBe('Recipes · Feeder')
    rerender(<Title parts={['Pasta', 'Recipes']} />)
    expect(document.title).toBe('Pasta · Recipes · Feeder')
  })

  it('a new array with the same parts is not a change (callers write the literal inline)', () => {
    const { rerender } = render(<Title parts={['Plan']} />)
    document.title = 'someone else'
    rerender(<Title parts={['Plan']} />)
    expect(document.title).toBe('someone else')
  })

  it('does not restore the old title on unmount (the next page sets its own)', () => {
    const { unmount } = render(<Title parts={['Plan']} />)
    unmount()
    expect(document.title).toBe('Plan · Feeder')
  })
})

// RR4: the receipt screens are full-screen routes: no top bar, no bottom nav, the page has its own Back and sticky action bar (mock-ups 13 to 16).
import { describe, expect, it } from 'vitest'
import { isChromeless } from './chromeless'

describe('isChromeless: the receipt routes', () => {
  it.each(['/scan/receipt', '/scan/receipt/', '/scan/receipt/review', '/scan/receipt/review?x=1', '/scan/receipt#top'])('%s hides the bars', (p) => {
    expect(isChromeless(p)).toBe(true)
  })
  it.each(['/scan', '/scan/', '/scan/receipts', '/scanner/receipt', '/receipt', '/settings/scan/receipt'])('%s keeps the bars', (p) => {
    expect(isChromeless(p)).toBe(false)
  })
  it('does not change the old chromeless routes', () => {
    expect(isChromeless('/board')).toBe(true)
    expect(isChromeless('/cook/recipe/12')).toBe(true)
  })
})
